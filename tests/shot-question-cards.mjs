// Render statis komponen kartu soal + screenshot (dark & light).
// Memakai harness CDP yang sudah ada (tests/helpers/cdp.mjs).
// BUKAN bagian test suite — alat verifikasi visual.
//
// Menjalankan: node tests/shot-question-cards.mjs
import { connect } from './helpers/cdp.mjs';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, '.shots');
mkdirSync(outDir, { recursive: true });

// 1) Bundle entry dengan esbuild (JSX + import CSS-containing komponen).
const tmp = path.join(outDir, '_entry.mjs');
await build({
  entryPoints: [path.join(here, '.shot-entry.jsx')],
  outfile: tmp,
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  loader: { '.jsx': 'jsx' },
  external: ['react', 'react-dom', 'react-dom/server'],
  plugins: [
    {
      // Komponen mengimpor `questionService` (Firebase) hanya untuk dua helper
      // indeks-pilihan. Dialihkan ke stub agar render statis tidak butuh
      // Firebase/emulator. Logika stub disalin persis dari service asli.
      name: 'stub-question-service',
      setup(b) {
        b.onResolve({ filter: /questionService$/ }, () => ({
          path: path.join(here, '.shot-stub-service.mjs')
        }));
      }
    }
  ],
  logLevel: 'error'
});
// react/react-dom diserialisasi lewat createRequire agar ESM tidak gagal.
writeFileSync(
  tmp,
  `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n` +
    `globalThis.require = require;\n` +
    readFileSync(tmp, 'utf8')
);
const mod = await import(pathToFileURL(tmp).href);
const body = mod.renderAll();

// 2) Tulis HTML memakai CSS hasil build produksi (token design system asli).
const cssFile = readdirSync(path.join(root, 'dist', 'assets')).find((f) => f.endsWith('.css'));
const css = readFileSync(path.join(root, 'dist', 'assets', cssFile), 'utf8');
// CATATAN: token tema memakai DUA atribut — `data-color-theme` (tema) dan
// `data-mode` (terang/gelap) — dengan selector
// `[data-color-theme=…][data-mode=…]`. Kalau salah satu tidak ada, blok tidak
// cocok dan seluruh halaman jatuh ke tema default gelap. Keduanya harus di
// <html>. `class="dark"` ikut dipasang agar sinkron dengan `darkMode: 'class'`
// di tailwind.config.js.
// Dua file dibuat terpisah (dark & light) alih-alih toggle saat runtime,
// supaya tidak bergantung pada repaint.
const wrap = (mode) => `<!doctype html><html lang="id" data-color-theme="default" data-mode="${mode}"${
  mode === 'dark' ? ' class="dark"' : ''
}><head><meta charset="utf-8">
<style>${css}</style>
<style>
  body { margin:0; padding:24px; background: var(--bg); color: var(--text); font-family: var(--font-body); }
  .block { padding: 18px 0; border-bottom: 1px solid var(--line); }
  .block:first-of-type { border-bottom: 0; }
  h1 { font-family: var(--font-head); font-size: 20px; margin: 0 0 16px; color: var(--text); }
</style></head>
<body><h1>Daftar tipe soal — kartu inline (gaya Google Forms)</h1>
${body}
</body></html>`;

const darkPath = path.join(outDir, 'cards-dark.html');
const lightPath = path.join(outDir, 'cards-light.html');
writeFileSync(darkPath, wrap('dark'));
writeFileSync(lightPath, wrap('light'));

const page = await connect(9344);
try {
  await page.viewport(1100, 3400);
  await page.go(pathToFileURL(darkPath).href);
  await page.shot(path.join(outDir, 'cards-dark.png'));
  console.log('shot: cards-dark.png');

  await page.go(pathToFileURL(lightPath).href);
  await page.shot(path.join(outDir, 'cards-light.png'));
  console.log('shot: cards-light.png');
} finally {
  page.close();
}
console.log('Selesai. Output di', outDir);

