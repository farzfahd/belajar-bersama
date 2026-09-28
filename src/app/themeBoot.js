import { THEME_IDS } from './themes.js';

// Sumber tunggal untuk inline script anti-flash di <head>.
//
// APAKAH INI PERLU: token warna + font hidup di dua atribut <html> yang hanya
// bisa dipasang JavaScript. Tanpa script sebelum render pertama, pengguna yang
// memilih tema terang (atau tema selain default) akan melihat satu frame tema
// gelap dulu — pada koneksi lambat frame itu bisa terasa. /src/main.jsx adalah
// module script, jadi browser MENUNDA eksekusinya sampai seluruh HTML selesai
// di-parse; itu terlambat untuk keperluan anti-flash. Karena itu script ini
// harus inline dan harus jalan sebelum body dirender.
//
// KENAPA TIDAK BISA DI-HANDLE CSS SAJA: nilai mode disimpan di localStorage,
// bukan di dalam CSS, jadi tidak ada selector CSS yang bisa mendahului nilai
// itu. Script pendek ini satu-satunya cara.
//
// CSP: produksi melarang inline script, jadi `vite.config.js` menghitung hash
// SHA-256 dari string di bawah lalu menyisipkannya ke `script-src`. Karena
// keduanya berasal dari konstanta yang sama, hash tidak mungkin meleset dari
// isi script. tests/theme-boot.test.mjs memverifikasi ulang hash itu terhadap
// HTML hasil build.
//
// Catatan: spasi di dalam string script ikut ter-hash. Plugin menghitung ulang
// hash setiap build, jadi mengubah format script aman; yang wajib dijaga hanya
// script ini tetap self-contained (tanpa import) dan tidak membaca DOM apa pun
// yang belum ada pada saat ini dieksekusi.
export const THEME_BOOT_SCRIPT = `(function () {
  var THEMES = ${JSON.stringify(THEME_IDS)};
  var COLOR_KEY = 'lb:colorTheme';
  var MODE_KEY = 'lb:theme';
  var d = document.documentElement;
  var color = 'default';
  var mode = 'dark';
  try {
    var c = localStorage.getItem(COLOR_KEY);
    if (c && THEMES.indexOf(c) !== -1) color = c;
    var m = localStorage.getItem(MODE_KEY);
    if (m === 'light' || m === 'dark') {
      mode = m;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      mode = 'light';
    }
  } catch (e) {}
  d.setAttribute('data-color-theme', color);
  d.setAttribute('data-mode', mode);
  if (mode === 'dark') d.classList.add('dark');
  else d.classList.remove('dark');
  try {
    var meta = document.querySelector('meta[name="theme-color"]');
    var bg = window.getComputedStyle(d).getPropertyValue('--bg');
    if (meta && bg) meta.setAttribute('content', bg.trim());
  } catch (e) {}
})();`;
