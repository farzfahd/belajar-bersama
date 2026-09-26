import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    "connect-src 'self' wss://*.firebaseio.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://*.googleapis.com https://*.appspot.com https://appcheck.googleapis.com https://*.firebaseapp.com",
    "frame-src https://accounts.google.com https://www.google.com https://www.recaptcha.net"
  ];
  return {
    name: 'inject-csp',
    transformIndexHtml(html, ctx) {
      const isDev = Boolean(ctx && ctx.server);
      const csp = [...base];
      if (isDev) {
        // Dev: React Refresh pakai inline script, HMR WebSocket, emulator di localhost.
        csp[0] = "default-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*";
        csp[7] = "script-src 'self' 'unsafe-inline' https://firebaseinstallations.googleapis.com https://www.googleapis.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net";
        csp[8] = "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss://*.firebaseio.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://*.googleapis.com https://*.appspot.com https://appcheck.googleapis.com https://*.firebaseapp.com https://www.recaptcha.net";
      }
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${csp.join('; ')}">`
      );
    }
  };
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 5173
  }
});
