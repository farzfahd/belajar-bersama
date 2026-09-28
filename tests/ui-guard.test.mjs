// Penjaga regresi design token & aksesibilitas. Tes ini membaca SOURCE sebagai
// teks (bukan DOM), jadi bisa jalan tanpa emulator maupun browser —
// berbeda dengan tests/filter-panel-check.mjs yang butuh dev server.
//
// Yang dijaga di sini adalah cacat yang SUDAH terjadi di repo ini:
//   1. kelas Tailwind yang tidak ada di config (mis. `bg-sunken` sebelum
//      alias-nya dibuat) — tidak error saat build, hanya diam-diam tanpa gaya;
//   2. modifier opacity pada warna yang isinya variabel CSS
//      (`bg-accent/12` dst.) — tidak menghasilkan warna yang benar;
//   3. `text-white` di atas warna accent, yang kontrasnya gagal WCAG AA
//      (putih di #5b6ef5 hanya 4.21:1);
//   4. `window.confirm` untuk aksi destruktif, padahal ConfirmDialog sudah ada;
//   5. id field yang bentrok di daftar yang dirender berkali-kali.
//
// PENTING: menambah file .mjs baru TIDAK otomatis menambah file ini ke
// test:units — daftarnya ada di package.json. Kalau ada file tes baru,
// tambahkan juga ke script-nya.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const rel = (f) => relative(root, f).replace(/\\/g, '/');
const read = (f) => readFileSync(f, 'utf8');
const show = (hits) => (hits.length ? '\n' + hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join('\n') : '');

// Baris yang isinya cuma komentar tidak boleh dihitung sebagai temuan kelas
// CSS — komentar sengaja menyebut kelas yang DICARI, misalnya
// "bukan `bg-accent text-white`". Baris yang diawali `//` atau `*` ( komentar
// blok ) dilewati supaya tidak ada false positive.
const isComment = (text) => {
  const t = text.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

/** Kumpulkan { file, line, text } untuk setiap baris yang cocok regex. */
function scan(regex) {
  const hits = [];
  for (const file of files) {
    read(file)
      .split('\n')
      .forEach((text, i) => {
        if (isComment(text)) return;
        if (regex.test(text)) hits.push({ file: rel(file), line: i + 1, text: text.trim() });
      });
  }
  return hits;
}

describe('kelas Tailwind yang dikenal', () => {
  // Hanya nama token kustom yang diperiksa, bukan semua kelas Tailwind: itu
  // yang pernah hilang diam-diam (build tetap hijau, elemen jadi tanpa gaya).
  const KNOWN = [
    'sunken',
    'accentsolid',
    'onaccent',
    'accentsoft',
    'oksoft',
    'dangersoft',
    'warnsoft',
    'elevated',
    'bg2',
    'linestrong',
    'dimmer'
  ];

  const tokenUse = new RegExp(`\\b(?:bg|text|border|ring|from|to|via)-(${KNOWN.join('|')})\\b`, 'g');

  it('setiap token kustom yang dipakai ada di tailwind.config.js', () => {
    const config = readFileSync(join(root, 'tailwind.config.js'), 'utf8');
    const missing = [];
    for (const file of files) {
      read(file)
        .split('\n')
        .forEach((text, i) => {
          if (isComment(text)) return;
          for (const m of text.matchAll(tokenUse)) {
            if (!new RegExp(`${m[1]}\\s*:\\s*['"\`]var\\(--`).test(config)) {
              missing.push(`${rel(file)}:${i + 1} (${m[1]})`);
            }
          }
        });
    }
    assert.equal(missing.length, 0, `token tidak dipetakan di tailwind.config.js: ${missing.join(', ')}`);
  });

  it('token kustom benar-benar dipetakan ke variabel CSS', () => {
    const config = readFileSync(join(root, 'tailwind.config.js'), 'utf8');
    for (const token of KNOWN) {
      assert.match(config, new RegExp(`${token}\\s*:\\s*['"\`]var\\(--`), `${token} harus -> var(--...)`);
    }
  });
});

describe('modifier opacity pada warna variabel CSS', () => {
  // `bg-accent/12` mencoba menambah alpha ke `var(--accent)`. Tailwind menulis
  // color-mix yang tidak bisa membaca alpha dari var(), hasilnya tidak
  // berlaku. Pola yang benar: tulis eksplisit lewat color-mix.
  const TOKENS = 'accent|accentsoft|accentsolid|ok|warn|danger|ink|dim|dimmer|line|linestrong|bg|bg2|elevated';
  const BAD = new RegExp(`\\b(?:bg|text|border|ring|fill|stroke)-(?:${TOKENS})/\\d+\\b`);

  it('tidak ada /opacity pada token warna berbasis var()', () => {
    const hits = scan(BAD);
    assert.equal(hits.length, 0, `pakai color-mix eksplisit, bukan /opacity:${show(hits)}`);
  });
});

describe('warna mentah di atas warna brand', () => {
  it('tidak ada text-white di atas bg-accent/accentsolid/ok/danger', () => {
    const hits = scan(/\btext-white\b/);
    const bad = hits.filter((h) => /\b(?:bg-accent|bg-accentsolid|bg-ok|bg-danger|bg-warn)\b/.test(h.text));
    assert.equal(bad.length, 0, `pakai bg-accentsolid + text-onaccent:${show(bad)}`);
  });
});

describe('konfirmasi destruktif', () => {
  it('tidak ada window.confirm di src (pakai ConfirmDialog)', () => {
    const hits = scan(/\bwindow\.confirm\s*\(/);
    assert.equal(hits.length, 0, `ConfirmDialog sudah tersedia:${show(hits)}`);
  });

  it('ConfirmDialog menutup diri hanya setelah onConfirm berhasil', () => {
    const src = readFileSync(join(SRC, 'shared/ui/ConfirmDialog.jsx'), 'utf8');
    const catchIdx = src.indexOf('catch');
    assert.ok(catchIdx > -1, 'harus menangani kegagalan onConfirm');
    // Ambil HANYA isi blok catch (sampai kurung kurawal penutupnya), bukan
    // 400 karakter berikutnya — isi setelahnya sudah masuk ke JSX yang memang
    // wajar menyebut onClose.
    const body = src.slice(src.indexOf('{', catchIdx) + 1);
    const catchBlock = body.slice(0, body.indexOf('}'));
    // Menutup dialog saat gagal sama dengan memberi tahu pengguna "beres"
    // padahal tidak ada data yang berubah.
    assert.doesNotMatch(catchBlock, /onClose/, 'onClose tidak boleh dipanggil di dalam catch');
  });
});

describe('memuat: spinner selalu bermenara', () => {
  it('Spinner memakai role status', () => {
    const src = readFileSync(join(SRC, 'shared/components/Spinner.jsx'), 'utf8');
    assert.match(src, /role="status"/, 'role status memberi pengumuman ke pembaca layar');
  });

  it('PageLoading meneruskan label ke Spinner', () => {
    const src = readFileSync(join(SRC, 'shared/components/PageLoading.jsx'), 'utf8');
    assert.match(src, /<Spinner[^>]*label=\{label\}/, 'label harus diteruskan');
  });

  // Spinner tanpa label hanya bermakna kalau ada teks lain di sebelahnya
  // (mis. di dalam Button yang sudah bertuliskan, atau di sebelah `label`).
  // Daftar ini alasannya, bukan cuma pengecualian diam-diam: kalau ketemu
  // Spinner telanjang di file lain, halaman itu kembali_ring tanpa keterangan.
  const SPINNER_OK = {
    'src/shared/ui/Button.jsx': 'dekoratif; tombol sudah punya teks sendiri',
    'src/shared/components/SplashScreen.jsx': 'ada teks {label} di sebelah spinner',
    'src/features/notes/components/NoteCard.jsx': 'di dalam Button berlabel (Buku/Dibukuan)',
    'src/features/resources/components/ResourceCard.jsx': 'di dalam Button berlabel'
  };

  it('Spinner telanjang hanya ada di tempat yang sudah punya teks', () => {
    const hits = scan(/<Spinner\b/).filter((h) => !/\blabel=/.test(h.text));
    const bad = hits.filter((h) => !SPINNER_OK[h.file]);
    assert.equal(bad.length, 0, `pakai PageLoading, beri label, atau jelaskan alasannya:${show(bad)}`);
  });
});

describe('id field unik di daftar yang dirender berkali-kali', () => {
  it('QuestionCardDetails memakai id dari prefix yang dioper pemanggil', () => {
    const src = readFileSync(join(SRC, 'features/quizzes/components/QuestionCardDetails.jsx'), 'utf8');
    assert.match(src, /idPrefix/, 'harus menerima idPrefix');
    assert.match(src, /id=\{fid\(/, 'setiap field harus memakai id dari fid()');
  });

  it('QuestionCard mengoper prefix stabil dari useId', () => {
    const src = readFileSync(join(SRC, 'features/quizzes/components/QuestionCard.jsx'), 'utf8');
    // Index berubah saat reorder, jadi tidak boleh dipakai sebagai id.
    assert.match(src, /useId/, 'prefix harus dari useId');
    assert.match(src, /idPrefix=\{detailIdPrefix\}/, 'harus meneruskan ke QuestionCardDetails');
  });

  it('QuestionAttemptForm memberi id per soal, bukan per label saja', () => {
    const src = readFileSync(join(SRC, 'features/quizzes/components/QuestionAttemptForm.jsx'), 'utf8');
    assert.match(src, /question\?\.id/, 'prefix harus dari question.id');
    assert.match(src, /id=\{fieldId\(/, 'Input harus dapat id eksplisit');
  });

  it('Input/Select punya jalur id eksplisit', () => {
    // Input memakai `inputId`, Select memakai `selectId` — keduanya harus
    // menghormati `id` dari pemanggil supaya id bisa dibuat unik per kartu.
    const input = readFileSync(join(SRC, 'shared/ui/Input.jsx'), 'utf8');
    assert.match(input, /id=\{inputId\}/, 'Input harus menghormati id dari pemanggil');
    const select = readFileSync(join(SRC, 'shared/ui/Select.jsx'), 'utf8');
    assert.match(select, /id=\{selectId\}/, 'Select harus menghormati id dari pemanggil');
  });
});

describe('pola alur tanpa jalan keluar (matching)', () => {
  it('sisi kanan menjelaskan prasyarat lewat requireLeft(), bukan return diam', () => {
    const src = readFileSync(join(SRC, 'features/questions/components/MatchingBoard.jsx'), 'utf8');
    assert.match(src, /requireLeft/, 'perlu ada feedback saat belum ada item kiri terpilih');
    // Pola lama: `if (selectedLeft === null) return;` → tanpa penjelasan apa pun.
    assert.doesNotMatch(src, /if \(flow\.selectedLeft === null\) return;/, 'return diam harus dihapus');
  });
});
