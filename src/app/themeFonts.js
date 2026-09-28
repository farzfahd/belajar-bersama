import { themeFontHref, themeHeadFontHref, themeById } from './themes.js';

// Pemuat font Google per tema.
//
// Prinsip: hanya font tema yang SEDANG AKTIF yang dimuat. `index.html` sudah
// preload tiga family tema default (karena itu nilai fallback sebelum JS
// berjalan), jadi tema default tidak pernah menghasilkan request tambahan.
//
// Kenapa dimuat lewat JS, bukan `<link>` statis di index.html: kalau keenam
// tema dimuat sekaligus, satu pengguna hanya memakai satu tema tapi tetap
// menarik 15 file font. Dengan pemuatan lazy, biaya jaringan mengikuti tema
// yang benar-benar dipilih.
//
// Trade-off yang diterima: `display=swap` dipakai di semua link, jadi teks
// selalu terbaca seketika dengan font fallback sistem. Yang tertunda hanya
// bentuk glyph, bukan keterbacaan.

const loaded = new Set();

function alreadyInDocument(href) {
  return Array.from(document.querySelectorAll('link[data-theme-fonts]')).some(
    (link) => link.getAttribute('href') === href
  );
}

function inject(href, id, kind) {
  if (loaded.has(href) || alreadyInDocument(href)) {
    loaded.add(href);
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.themeFonts = kind === 'all' ? id : `${id}-head`;
  document.head.appendChild(link);
  loaded.add(href);
}

/** Muat head + body + mono untuk satu tema (dipakai saat tema diaktifkan). */
export function loadThemeFonts(id) {
  const theme = themeById(id);
  if (theme.preloaded) return;
  inject(themeFontHref(id), id, 'all');
}

/**
 * Muat hanya font heading beberapa tema, untuk pratinjau "Aa" di ThemeSwitcher.
 * Body dan mono sengaja tidak dimuat: pratinjau hanya menampilkan heading,
 * dan memuat 15 family sekaligus akan membuat halaman Pengaturan berat.
 */
export function loadPreviewHeadFonts(ids) {
  for (const id of ids) {
    const theme = themeById(id);
    if (theme.preloaded) continue;
    inject(themeHeadFontHref(id), id, 'head');
  }
}
