// Penjaga regresi sistem 6 tema × 2 mode.
//
// Yang dijaga di sini:
//   1. SETIAP blok tema wajib punya kelengkapan token yang sama. Tema yang
//      kehilangan satu token tidak error saat build — dia hanya diam-diam
//      mewarisi nilai blok sebelumnya, dan itu penyebab bug "ganti tema tapi
//      sebagian warna tidak berubah".
//   2. SETIAP pasangan teks/latar wajib ≥4.5:1 (WCAG AA teks kecil) di semua
//      12 kombinasi. Warna tema diturunkan lewat lightness (hue tetap), jadi
//      angka ini bisa dijaga tanpa mengunci palet.
//   3. Isian `*-soft` adalah rgba di atas latar, jadi yang diuji adalah hasil
//      kompositnya — bukan warna soft-nya sendiri.
//   4. Font: keenam blok `[data-color-theme]` harus ada dan menunjuk ke nama
//      family yang sama dengan yang Dimuat di src/app/themes.js (kalau tidak,
//      tema "aktif" akan diam-diam memakai fallback sistem).
//   5. Hash CSP untuk inline script anti-flash harus cocok dengan isi script
//      yang benar-benar ada di dist/index.html (dicek hanya kalau sudah ada
//      hasil build).
//
// PENTING: file .mjs baru TIDAK otomatis masuk test:units — daftarnya ada di
// package.json.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { COLOR_THEMES, THEME_IDS, themeFontHref, themeHeadFontHref } from '../src/app/themes.js';
import { THEME_BOOT_SCRIPT } from '../src/app/themeBoot.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Komentar dibuang dulu: parser blok di bawah menebak selector dari teks
// mentah, dan komentar `/* ---------- 2. Pastel … */` menempel ke baris
// selektor sehingga kunci Map tidak sama persis dengan selector-nya.
const css = readFileSync(join(root, 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const MODES = ['light', 'dark'];

// Token yang harus ada di setiap blok warna. `--radius`/`--radius-sm` dan
// `--font-*` TIDAK termasuk: bentuk dan font tidak ikut berubah antar tema.
const COLOR_TOKENS = [
  '--bg', '--bg-elevated', '--bg-sunken',
  '--text', '--text-dim', '--text-dimmer',
  '--accent', '--accent-soft', '--accent-solid', '--on-accent', '--accent-ink',
  '--border', '--border-strong',
  '--ok', '--ok-soft', '--ok-ink',
  '--warn', '--warn-soft', '--warn-ink',
  '--danger', '--danger-soft', '--danger-ink',
  '--glow', '--glow-danger', '--scrim', '--shadow'
];

// [foreground, background] — background boleh `token` atau `tokenA + tokenB`
// untuk isian rgba di atas latar (lihat `composite` di bawah).
const PAIRS = [
  ['--text', '--bg'],
  ['--text', '--bg-elevated'],
  ['--text', '--bg-sunken'],
  ['--text-dim', '--bg'],
  ['--text-dim', '--bg-elevated'],
  ['--text-dim', '--bg-sunken'],
  ['--text-dimmer', '--bg'],
  ['--text-dimmer', '--bg-elevated'],
  ['--text-dimmer', '--bg-sunken'],
  // Warna status juga dipakai sebagai TEKS polos di atas permukaan terang
  // (label nav, tab aktif, "tersimpan", pesan validasi).
  ['--accent', '--bg'],
  ['--accent', '--bg-elevated'],
  ['--accent', '--bg-sunken'],
  ['--ok', '--bg'],
  ['--warn', '--bg'],
  ['--danger', '--bg'],
  // Token `ink` dipakai sebagai teks di atas isian `*-soft` (Badge, Button).
  ['--accent-ink', '--bg + --accent-soft'],
  ['--accent-ink', '--bg-elevated + --accent-soft'],
  ['--ok-ink', '--bg + --ok-soft'],
  ['--warn-ink', '--bg + --warn-soft'],
  ['--danger-ink', '--bg + --danger-soft'],
  ['--on-accent', '--accent-solid']
];

// Dua pasangan yang memang di bawah ambang dan SENGAJA dibiarkan: nilainya
// sama persis dengan skema single-token sebelum sistem 6 tema diperluas, jadi
// tidak boleh "diperbaiki diam-diam" di sini — perbaikannya perlu keputusan
// eksplisit karena mengubah tampilan default yang sudah dipakai.
const LEGACY_BELOW_AA = new Set([
  'default/dark --text-dimmer on --bg-elevated',
  'default/dark --accent on --bg-elevated'
]);

// ---- util warna (WCAG 2.x) ----------------------------------------------

function parseColor(value) {
  const v = value.trim();
  if (v.startsWith('#')) {
    const hex = v.length === 4
      ? v.slice(1).split('').map((c) => c + c).join('')
      : v.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Warna tidak bisa dibaca: ${value}`);
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts.length > 3 ? parts[3] : 1];
}

/** rgb tuple + alpha → rgb tuple, alpha di-alpha-kan di atas `under`. */
function over(rgb, under) {
  const a = rgb[3] ?? 1;
  return [0, 1, 2].map((i) => rgb[i] * a + under[i] * (1 - a));
}

function luminance([r, g, b]) {
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// ---- parser blok CSS -----------------------------------------------------

/**
 * Kumpulkan blok `--token: value;` per selektor yang mengandung pola.
 * Selector ':root,\n[...]' dipecah jadi dua kunci supaya blok fallback default
 * bisa dicari lewat nama block bertema-nya.
 */
function collectBlocks(pattern) {
  const out = new Map();
  const re = /([^{}]+)\{([^{}]+)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[2];
    const tokens = {};
    for (const decl of body.split(';')) {
      const i = decl.indexOf(':');
      if (i === -1) continue;
      tokens[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    for (const raw of m[1].split(',')) {
      const selector = raw.trim();
      if (pattern.test(selector)) out.set(selector, tokens);
    }
  }
  return out;
}

const themeBlocks = collectBlocks(/data-color-theme=.*data-mode=/);
const fontBlocks = collectBlocks(/^\[data-color-theme='[a-z]+'\]$/);

function blockFor(id, mode) {
  return themeBlocks.get(`[data-color-theme='${id}'][data-mode='${mode}']`);
}

const AA = 4.5;

describe('sistem tema: 6 tema x 2 mode', () => {
  it('src/index.css punya blok untuk tiap kombinasi tema dan mode', () => {
    for (const id of THEME_IDS) {
      for (const mode of MODES) {
        assert.ok(
          blockFor(id, mode),
          `blok [data-color-theme='${id}'][data-mode='${mode}'] tidak ada di src/index.css`
        );
      }
    }
  });

  it('tema default gelap juga berlaku tanpa atribut apa pun (fallback sebelum JS)', () => {
    // Tanpa ini, pengguna tanpa JS / dengan localStorage kosong akan mendapat
    // token kosong dan seluruh halaman kehilangan warna.
    const fallback = /:root,\s*\[data-color-theme='default'\]\[data-mode='dark'\]\s*\{/.test(css);
    assert.ok(fallback, 'selector fallback `:root, [data-color-theme=default][data-mode=dark]` hilang');
  });

  it('setiap blok tema lengkap: tidak ada token yang diwarisi diam-diam dari blok lain', () => {
    for (const id of THEME_IDS) {
      for (const mode of MODES) {
        const tokens = blockFor(id, mode);
        const missing = COLOR_TOKENS.filter((t) => !(t in tokens));
        assert.deepEqual(
          missing,
          [],
          `blok ${id}/${mode} tidak mendefinisikan: ${missing.join(', ')}`
        );
      }
    }
  });

  it('setiap blok tema menetapkan color-scheme yang cocok dengan modenya', () => {
    for (const id of THEME_IDS) {
      for (const mode of MODES) {
        assert.equal(
          blockFor(id, mode)['color-scheme'],
          mode,
          `blok ${id}/${mode} tidak punya color-scheme: ${mode}`
        );
      }
    }
  });

  it('radius dan font dasar tidak ikut berubah antar tema', () => {
    const base = /:root\s*\{([^{}]+)\}/.exec(css);
    assert.ok(base, 'blok :root dasar hilang');
    assert.match(base[1], /--radius:\s*8px/);
    assert.match(base[1], /--radius-sm:\s*6px/);
  });

  for (const id of THEME_IDS) {
    for (const mode of MODES) {
      it(`kontras teks kecil >= ${AA}:1 di ${id}/${mode}`, () => {
        const tokens = blockFor(id, mode);
        const failures = [];
        for (const [fg, bgSpec] of PAIRS) {
          const [base, layer] = bgSpec.split(' + ');
          const fgRgb = parseColor(tokens[fg]);
          const bgRgb = layer
            ? over(parseColor(tokens[layer]), parseColor(tokens[base]))
            : parseColor(tokens[base]);
          const r = ratio(fgRgb, bgRgb);
          const key = `${id}/${mode} ${fg} on ${bgSpec}`;
          if (r < AA) failures.push({ key, r, legacy: LEGACY_BELOW_AA.has(key) });
        }

        const unexpected = failures.filter((f) => !f.legacy);
        const legacy = failures.filter((f) => f.legacy);
        assert.deepEqual(
          unexpected.map((f) => `${f.key} = ${f.r.toFixed(2)}:1`),
          [],
          `pasangan teks di bawah ${AA}:1 (harus diperbaiki di src/index.css):`
        );
        // Pasangan legacy boleh gagal, tapi HANYA yang sudah terdaftar di
        // LEGACY_BELOW_AA — kalau daftarnya tidak terpakai, beritahu.
        assert.deepEqual(
          legacy.map((f) => f.key).sort(),
          [...LEGACY_BELOW_AA].filter((k) => k.startsWith(`${id}/${mode}`)).sort(),
          'daftar LEGACY_BELOW_AA tidak cocok dengan hasil hitung'
        );
      });
    }
  }
});

describe('font per tema', () => {
  it('src/index.css punya blok font untuk keenam tema', () => {
    for (const id of THEME_IDS) {
      assert.ok(
        fontBlocks.has(`[data-color-theme='${id}']`),
        `blok font [data-color-theme='${id}'] tidak ada di src/index.css`
      );
    }
  });

  it('setiap blok font menunjuk ke ketiga family yang dimuat themes.js', () => {
    for (const { id, fonts } of COLOR_THEMES) {
      const body = [...fontBlocks.entries()].find(([sel]) => sel === `[data-color-theme='${id}']`)[1];
      const stacks = ['--font-head', '--font-body', '--font-mono']
        .map((t) => body[t] || '')
        .join(' ');
      for (const family of Object.values(fonts)) {
        const name = decodeURIComponent(family.split(':')[0].replace(/\+/g, ' '));
        assert.ok(
          stacks.includes(`'${name}'`),
          `--font-* tema ${id} tidak menyebut '${name}' (famili yang dimuat di themes.js)`
        );
      }
    }
  });

  it('tema default ditandai preloaded karena sudah ada di index.html', () => {
    const def = COLOR_THEMES.find((t) => t.id === 'default');
    assert.equal(def.preloaded, true);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.ok(
      html.includes(themeFontHref('default')),
      'link font tema default di index.html tidak sama dengan hasil themeFontHref()'
    );
  });

  it('index.html tidak memuat font tema lain (harus lazy)', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    for (const { id } of COLOR_THEMES) {
      if (id === 'default') continue;
      assert.ok(
        !html.includes(themeFontHref(id)) && !html.includes(themeHeadFontHref(id)),
        `font tema ${id} ikut termuat di index.html; harusnya lazy lewat src/app/themeFonts.js`
      );
    }
  });
});

describe('penyambungan atribut di <html>', () => {
  // Regresi nyata: ThemeProvider pernah hanya memasang `data-mode` dan
  // MELUPAKAN `data-colorTheme`, jadi semua token tema tidak pernah berganti —
  // tombol di Settings tetap "tertekan" tapi halaman tidak berubah warna.
  // Karena CSS diuji terpisah dari React, bug ini tidak tertangkap tes lain.
  const providerSrc = readFileSync(join(root, 'src/app/providers.jsx'), 'utf8');
  const switcherSrc = readFileSync(
    join(root, 'src/features/settings/components/ThemeSwitcher.jsx'),
    'utf8'
  );

  it('ThemeProvider memasang KEDUA atribut pada documentElement', () => {
    assert.match(
      providerSrc,
      /root\.dataset\.colorTheme\s*=\s*colorTheme/,
      'src/app/providers.jsx tidak memasang root.dataset.colorTheme'
    );
    assert.match(
      providerSrc,
      /root\.dataset\.mode\s*=\s*mode/,
      'src/app/providers.jsx tidak memasang root.dataset.mode'
    );
  });

  it('kartu pratinjau memasang KEDUA atribut (tanpa data-mode palet semua sama)', () => {
    assert.match(switcherSrc, /data-color-theme=\{theme\.id\}/);
    assert.match(
      switcherSrc,
      /data-mode=\{mode\}/,
      'ThemeSwitcher tidak memasang data-mode; blok [data-color-theme][data-mode] tidak akan cocok'
    );
  });

  it('ThemeProvider MENYIMPAN kedua preferensi (bukan hanya membacanya)', () => {
    // Regresi nyata: tema pernah hanya di-set di state, tanpa disimpan, sehingga
    // selalu kembali ke default begitu halaman dimuat ulang.
    assert.match(
      providerSrc,
      /localStorage\.setItem\(COLOR_KEY,\s*colorTheme\)/,
      'src/app/providers.jsx tidak menyimpan lb:colorTheme'
    );
    assert.match(
      providerSrc,
      /localStorage\.setItem\(MODE_KEY,\s*mode\)/,
      'src/app/providers.jsx tidak menyimpan lb:theme'
    );
  });

  it('kunci localStorage yang dibaca themeBoot sama dengan yang ditulis provider', () => {
    for (const key of ['lb:colorTheme', 'lb:theme']) {
      assert.ok(THEME_BOOT_SCRIPT.includes(key), `themeBoot.js tidak membaca ${key}`);
      assert.ok(providerSrc.includes(`'${key}'`), `providers.jsx tidak memakai ${key}`);
    }
  });
});

describe('anti-flash', () => {
  it('script boot memuat daftar id tema yang sama dengan registry', () => {
    for (const id of THEME_IDS) {
      assert.ok(
        THEME_BOOT_SCRIPT.includes(`"${id}"`),
        `id tema "${id}" tidak ada di THEME_BOOT_SCRIPT`
      );
    }
  });

  it('script boot sinkron: tidak boleh menunda, dan tidak menyentuh DOM yang belum ada', () => {
    // Kesalahan di sini = halaman putih atau tema salah saat start.
    assert.ok(!/\brequestAnimationFrame\b|\bsetTimeout\b|\bsetInterval\b/.test(THEME_BOOT_SCRIPT));
    assert.ok(THEME_BOOT_SCRIPT.includes('documentElement'));
    assert.ok(THEME_BOOT_SCRIPT.includes('meta[name="theme-color"]'));
  });

  it('index.html menyisipkan script lewat placeholder, bukan menulis manual', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.ok(html.includes('<!--THEME-BOOT-->'), 'placeholder <!--THEME-BOOT--> hilang dari index.html');
    assert.ok(!/<script>(?!\s*\(function)/i.test(html), 'ada inline script manual di index.html');
  });

  it('hash CSP produksi cocok dengan isi script (dicek terhadap dist hasil build)', () => {
    const distIndex = join(root, 'dist/index.html');
    if (!existsSync(distIndex)) {
      // Lewati, bukan gagal: test:units jalan sebelum build.
      return;
    }
    const html = readFileSync(distIndex, 'utf8');
    const expected = `'sha256-${createHash('sha256').update(THEME_BOOT_SCRIPT).digest('base64')}'`;

    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
    assert.ok(csp, 'meta CSP tidak ada di dist/index.html');
    assert.ok(
      csp[1].includes(expected),
      `hash CSP tidak memuat ${expected} — inline script anti-flash akan diblokir di produksi`
    );
    assert.ok(
      !/script-src[^;]*'unsafe-inline'/.test(csp[1]),
      "script-src produksi masih memakai 'unsafe-inline'"
    );

    // Hash hanya berguna kalau script-nya benar-benar ada; dan harus persis
    // sama dengan string yang di-hash (kalau build mengubahnya, hash jadi sia-sia).
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length > 0, 'script inline tidak ditemukan di dist/index.html');
    for (const s of scripts) {
      assert.equal(
        `'sha256-${createHash('sha256').update(s).digest('base64')}'`,
        expected,
        'isi script inline di dist tidak identik dengan THEME_BOOT_SCRIPT'
      );
    }
  });
});
