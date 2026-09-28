import { createHash } from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { THEME_BOOT_SCRIPT } from './src/app/themeBoot.js';

// Hash untuk satu-satunya inline script yang diizinkan: theme anti-flash di
// src/app/themeBoot.js. SHA-256 atas TEKS script (bukan atas tag-nya), seperti
// yang diwajibkan CSP untuk inline script.
//
// Dipakai di produksi saja: di dev `script-src` sudah memuat 'unsafe-inline'
// karena React Refresh butuh inline script. Menambahkan hash di sana tidak
// menambah keamanan, hanya menambah satu tempat untuk salah.
//
// Mengimpor konstanta yang sama dengan yang di-inline ke index.html berarti
// hash tidak mungkin meleset dari isi script. tests/theme-boot.test.mjs tetap
// memverifikasi ulang terhadap HTML hasil build, karena langkah lain seperti
// minifier bisa mengubah isi HTML sebelum plugin ini berjalan.
const THEME_BOOT_HASH = `'sha256-${createHash('sha256')
  .update(THEME_BOOT_SCRIPT)
  .digest('base64')}'`;

// CSP via <meta>: GitHub Pages tidak bisa set HTTP header sendiri,
// jadi <meta> adalah satu-satunya opsi (lihat catatan di SECURITY.md).
function cspPlugin() {
  const base = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' https://firebaseinstallations.googleapis.com https://www.googleapis.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net",
    "connect-src 'self' wss://*.firebaseio.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://*.googleapis.com https://*.appspot.com https://appcheck.googleapis.com https://*.firebaseapp.com https://firebaseappcheck.googleapis.com https://www.google.com/recaptcha/",
    "frame-src https://accounts.google.com https://www.google.com https://www.recaptcha.net"
  ];
  return {
    name: 'inject-csp',
    transformIndexHtml(html, ctx) {
      const isDev = Boolean(ctx && ctx.server);
      const csp = [...base];
      csp[7] = isDev
        ? // Dev: React Refresh pakai inline script, HMR WebSocket, emulator di localhost.
          "script-src 'self' 'unsafe-inline' https://firebaseinstallations.googleapis.com https://www.googleapis.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net"
        : `script-src 'self' ${THEME_BOOT_HASH} https://firebaseinstallations.googleapis.com https://www.googleapis.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net`;
      if (isDev) {
        csp[0] = "default-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*";
        csp[8] = "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss://*.firebaseio.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://*.googleapis.com https://*.appspot.com https://appcheck.googleapis.com https://*.firebaseapp.com https://www.recaptcha.net";
      }
      const out = html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${csp.join('; ')}">`
      );
      // Script anti-flash disisipkan DI SINI, bukan ditulis manual di index.html,
      // supaya string yang di-hash di atas dijamin identik dengan yang dikirim.
      return out.replace(
        '<!--THEME-BOOT-->',
        `<script>${THEME_BOOT_SCRIPT}</script>`
      );
    }
  };
}

export default defineConfig(({ mode }) => {
  // `base` WAJIB sama dengan subpath tempat app disajikan, dan HARUS absolut
  // (diawali '/') untuk GitHub Pages project site.
  //
  // Kenapa bukan './' (relatif)? Deep link seperti /learn atau /quiz/abc
  // dilayani GitHub Pages lewat 404.html — yaitu salinan index.html. Dengan
  // base relatif, `./assets/app.js` di 404.html itu akan resolve ke
  // /belajar-bersama/learn/assets/app.js → 404 → layar putih kosong. Base
  // absolut membuat path aset tidak bergantung pada URL yang sedang aktif.
  const env = loadEnv(mode, process.cwd(), '');
  const routerBase = (env.VITE_ROUTER_BASENAME || '/').trim() || '/';
  const base = routerBase.endsWith('/') ? routerBase : `${routerBase}/`;

  return {
    plugins: [react(), cspPlugin()],
    base,
    build: {
      outDir: 'dist',
      sourcemap: false
    },
    server: {
      port: 5173
    }
  };
});
