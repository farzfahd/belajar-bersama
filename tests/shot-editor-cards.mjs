// Screenshot daftar kartu soal Quiz Editor (dark & light) memakai CSS build
// produksi, jadi token design system asli yang dipakai.
// BUKAN bagian test suite — alat verifikasi visual.
//
// Menjalankan: node tests/shot-editor-cards.mjs
import { connect } from './helpers/cdp.mjs';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, '.shots');
mkdirSync(outDir, { recursive: true });

const tmp = path.join(outDir, '_editor-entry.mjs');
await build({
  entryPoints: [path.join(here, '.shot-editor-entry.jsx')],
  outfile: tmp,
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  loader: { '.jsx': 'jsx' },
  external: ['react', 'react-dom', 'react-dom/server'],
  define: { 'import.meta.env': '{}' },
  plugins: [
    {
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
writeFileSync(
  tmp,
  `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n` +
    `globalThis.require = require;\n` +
    readFileSync(tmp, 'utf8')
);
const mod = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
const body = mod.renderAll();

const cssFile = readdirSync(path.join(root, 'dist', 'assets')).find((f) => f.endsWith('.css'));
const css = readFileSync(path.join(root, 'dist', 'assets', cssFile), 'utf8');

// Token tema memakai dua atribut: `data-color-theme` + `data-mode`
// (selector `[data-color-theme=…][data-mode=…]` di src/index.css). Keduanya
// wajib ada di <html>, kalau tidak halaman jatuh ke tema default gelap.
const wrap = (mode) => `<!doctype html><html lang="id" data-color-theme="default" data-mode="${mode}"${
  mode === 'dark' ? ' class="dark"' : ''
}><head><meta charset="utf-8">
<style>${css}</style>
<style>
  body { margin:0; padding:28px; background: var(--bg); color: var(--text); font-family: var(--font-body); }
  .shots { max-width: 900px; margin: 0 auto; }
  .shots > h1 { font-family: var(--font-head); font-size: 22px; margin: 0 0 18px; color: var(--text); }
</style></head>
<body><div class="shots">
<h1>Quiz Editor — daftar kartu soal</h1>
${body}
</div></body></html>`;

const darkPath = path.join(outDir, 'editor-cards-dark.html');
const lightPath = path.join(outDir, 'editor-cards-light.html');
writeFileSync(darkPath, wrap('dark'));
writeFileSync(lightPath, wrap('light'));

const page = await connect(9344);
try {
  await page.viewport(980, 1800);
  await page.go(pathToFileURL(darkPath).href);
  await page.shot(path.join(outDir, 'editor-cards-dark.png'));
  console.log('shot: editor-cards-dark.png');

  await page.go(pathToFileURL(lightPath).href);
  await page.shot(path.join(outDir, 'editor-cards-light.png'));
  console.log('shot: editor-cards-light.png');
} finally {
  page.close();
}
console.log('Selesai. Output di', outDir);
