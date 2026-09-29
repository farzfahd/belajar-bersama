#!/usr/bin/env node
// ============================================================================
// Sinkronisasi modul GRADING bersama (Assessment Security, M6/PART 6).
// ============================================================================
//
// MASALAH
// ------
// `grading.js` adalah SATU-SATUNYA implementasi penilaian (kewajiban global #8).
// Cloud Functions harus memakai implementasi yang sama. Tapi kode Cloud
// Functions hanya boleh mengimpor file DI DALAM folder `functions/` yang ikut
// di-deploy, sedangkan modul aslinya ada di `src/features/questions/utils/`.
//
// SOLUSI
// ------
// `shared/grading.js` adalah salinan TEPAT (byte-identik) dari
// `src/features/questions/utils/grading.js`. File itu yang di-deploy bersama
// Cloud Functions. Script ini:
//
//   1. Menyalin `src/.../grading.js` -> `functions/src/shared/grading.js`
//   2. Menyalin `src/.../grading.js` -> `shared/grading.js`
//   3. MENOLAK overwrite kalau file hasil salinan sudah ada tapi BERBEDA isinya
//      dan `--force` tidak diberikan. Ini mencegah "improvisasi" diam-diam yang
//      membuat server dan client punya algoritma penilaian berbeda.
//
// Jalankan: `node scripts/sync-grading.mjs` (otomatis oleh `npm run build`
// dan oleh `functions/package.json` script `predeploy`).
//
// BUKAN "COPY-PASTE": hanya ada SATU file yang boleh diedit
// (`src/features/questions/utils/grading.js`). Salinan lain turunan yang
// diverifikasi hash-nya. `tests/grading-parity.test.mjs` membandingkan isi ketiganya.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src', 'features', 'questions', 'utils', 'grading.js');

/**
 * Semua lokasi yang harus berisi salinan byte-identik.
 * `functions/src/shared/` ikut di-deploy; `shared/` dipakai tooling/tes.
 */
export const MIRRORS = [
  join(ROOT, 'shared', 'grading.js'),
  join(ROOT, 'functions', 'src', 'shared', 'grading.js')
];

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function syncGrading({ force = false, log = () => {} } = {}) {
  if (!existsSync(SOURCE)) {
    throw new Error(`Sumber grading tidak ditemukan: ${SOURCE}`);
  }
  const sourceBytes = readFileSync(SOURCE);
  const sourceHash = sha256(sourceBytes);

  const results = [];
  for (const target of MIRRORS) {
    const exists = existsSync(target);
    if (exists) {
      const currentHash = sha256(readFileSync(target));
      if (currentHash !== sourceHash && !force) {
        // Menolak menimpa salinan yang sudah DIVERIFIKASI berbeda. Kalau ini
        // muncul, berarti ada yang mengubah salinan secara manual — itu
        // justru yang harus dicegah, karena akan jadi algoritma penilaian kedua.
        throw new Error(
          [
            `Salinan grading di ${target} BERBEDA dari sumber dan tidak ditimpa.`,
            `  sumber: ${sourceHash}`,
            `  salinan: ${currentHash}`,
            '  Perbaiki dengan menyalin dari sumber, atau jalankan ulang dengan --force',
            '  bila memang perubahan itu disengaja dan sudah diuji.'
          ].join('\n')
        );
      }
      if (currentHash === sourceHash) {
        results.push({ target, action: 'unchanged', hash: currentHash });
        log(`grading sync: unchanged ${target}`);
        continue;
      }
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(SOURCE, target);
    results.push({ target, action: exists ? 'updated' : 'created', hash: sourceHash });
    log(`grading sync: ${exists ? 'updated' : 'created'} ${target}`);
  }
  return { sourceHash, results };
}

/** Hash ketiga file; identik bila sama. Dipakai tes drift. */
export function gradingHashes() {
  const files = [SOURCE, ...MIRRORS];
  const out = {};
  for (const f of files) {
    out[f] = existsSync(f) ? sha256(readFileSync(f)) : null;
  }
  return out;
}

// Jalankan sebagai skrip: `node scripts/sync-grading.mjs [--force]`
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const force = process.argv.includes('--force');
  try {
    const { sourceHash, results } = syncGrading({ force, log: (m) => console.log(m) });
    const changed = results.filter((r) => r.action !== 'unchanged');
    console.log(
      `grading sync done: sha256=${sourceHash.slice(0, 12)} mirror=${results.length} changed=${changed.length}`
    );
  } catch (e) {
    console.error(`[grading sync] GAGAL: ${e.message}`);
    process.exit(1);
  }
}
