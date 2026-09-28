/**
 * Registry enam tema warna.
 *
 * CATATAN PENTING: warna dan font tiap tema TIDAK didefinisikan di sini.
 * Seluruh nilai warna + font ada di src/index.css (12 blok
 * `[data-color-theme][data-mode]` dan 6 blok `[data-color-theme]` untuk font).
 * File ini hanya berisi metadata yang dibutuhkan JavaScript:
 *   - id tema (dipakai sebagai nilai atribut root & kunci localStorage)
 *   - label + keterangan singkat untuk UI
 *   - query css2 Google Fonts untuk head/body/mono (dimuat lazy)
 *   - urutan tampil di ThemeSwitcher
 *
 * Warna & font di sini TIDAK pernah dipakai untuk menggambar apa pun; preview
 * di Settings membaca token asli lewat atribut `data-color-theme`, jadi kartu
 * preview selalu sama persis dengan tema yang sebenarnya.
 */

const CSS2 = 'https://fonts.googleapis.com/css2';

function familiesHref(fonts) {
  const list = [fonts.head, fonts.body, fonts.mono].filter(Boolean);
  return `${CSS2}?${list.map((q) => `family=${q}`).join('&')}&display=swap`;
}

export const COLOR_THEMES = [
  {
    id: 'default',
    label: 'Indigo Minimal',
    hint: 'netral · tenang',
    // Font tema awal: sudah preload di index.html karena itu nilai fallback
    // sebelum JS sempat membaca localStorage, jadi tidak perlu dimuat lagi.
    preloaded: true,
    fonts: {
      head: 'Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400',
      body: 'Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800',
      mono: 'JetBrains+Mono:ital,wght@0,400..700;1,400..700'
    }
  },
  {
    id: 'pastel',
    label: 'Pastel',
    hint: 'lavender · lembut',
    fonts: {
      head: 'Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800',
      body: 'Nunito+Sans:ital,opsz,wght@0,6..12,200..1000;1,6..12,200..1000',
      mono: 'Space+Mono:ital,wght@0,400;0,700;1,400'
    }
  },
  {
    id: 'rose',
    label: 'Rose',
    hint: 'blush · hangat',
    fonts: {
      head: 'Petrona:ital,wght@0,400;0,500;0,600;1,400',
      body: 'Karla:ital,wght@0,400;0,500;0,700;1,400',
      mono: 'IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400'
    }
  },
  {
    id: 'forest',
    label: 'Forest',
    hint: 'sage · tenang',
    fonts: {
      head: 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400',
      body: 'Work+Sans:ital,wght@0,400;0,500;0,600;1,400',
      mono: 'JetBrains+Mono:ital,wght@0,400..700;1,400..700'
    }
  },
  {
    id: 'mono',
    label: 'Monochrome',
    hint: 'hitam-putih · tegas',
    fonts: {
      head: 'Archivo:ital,wght@0,400;0,500;0,600;0,700;1,400',
      body: 'Public+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
      mono: 'IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400'
    }
  },
  {
    id: 'ocean',
    label: 'Ocean',
    hint: 'teal · dingin',
    fonts: {
      head: 'Spectral:ital,wght@0,400;0,500;0,600;1,400',
      body: 'Libre+Franklin:ital,wght@0,400;0,500;0,600;0,700;1,400',
      mono: 'JetBrains+Mono:ital,wght@0,400..700;1,400..700'
    }
  }
];

export const DEFAULT_COLOR_THEME = 'default';
export const THEME_IDS = COLOR_THEMES.map((t) => t.id);

export function isColorTheme(value) {
  return typeof value === 'string' && THEME_IDS.includes(value);
}

export function themeById(id) {
  return COLOR_THEMES.find((t) => t.id === id) ?? COLOR_THEMES[0];
}

/** Link css2 untuk seluruh font sebuah tema (head + body + mono). */
export function themeFontHref(id) {
  return familiesHref(themeById(id).fonts);
}

/** Link css2 hanya untuk font heading — cukup untuk pratinjau "Aa" di Settings. */
export function themeHeadFontHref(id) {
  const { head } = themeById(id).fonts;
  return familiesHref({ head, body: null, mono: null });
}
