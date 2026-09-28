// Guard konfigurasi deploy — mencegah regresi yang HANYA terlihat saat deploy.
//
// Dua bug nyata yang lolos begitu saja sebelum ada tes ini (2026-09-27):
//   1. CSP tidak pernah ter-inject karena placeholder `<!--CSP-->` hilang dari
//      index.html — html.replace() diam-diam tidak mengubah apa pun, jadi
//      seluruh proteksi di vite.config.js TIDAK AKTIF di produksi.
//   2. `base: './'` (relatif) membuat setiap deep link GitHub Pages 404 →
//      layar putih kosong, karena `./assets/x.js` resolve relatif ke URL aktif.
//
//   3. App Check produksi memakai reCAPTCHA v3, padahal project ini memakai
//      reCAPTCHA Enterprise. VITE_RECAPTCHA_PROVIDER tidak pernah diisi di
//      .env.production.local maupun workflow, dan fallback di src/lib/firebase.js
//      adalah 'v3' → produksi diam-diam memakai provider yang salah.
//
// Test ini membangun dengan nilai yang BENAR-BENAR dipakai GitHub Pages
// (base + provider produksi), bukan default lokal, supaya jalur produksi
// benar-benar diuji.
//
// Menjalankan: node tests/deploy-config-check.mjs
// Bukan bagian `test:units` karena butuh hasil `npm run build` (dist/).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRecaptchaProvider, DEFAULT_RECAPTCHA_PROVIDER } from '../src/lib/appCheckProvider.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok });
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${info ? '  -> ' + info : ''}`);
}

// PENTING: build memakai nilai yang BENAR-BENAR dipakai GitHub Pages, bukan
// default lokal. Tanpa ini test hanya membuktikan base '/' dan tidak pernah
// menyentuh jalur produksi /belajar-bersama/.
const PROD_BASENAME = '/belajar-bersama';
const PROD_PROVIDER = 'enterprise';

console.log(`Menjalankan build produksi (base=${PROD_BASENAME}, provider=${PROD_PROVIDER})...\n`);
// `npm.cmd` tidak bisa di-spawn langsung di Node 24 (EINVAL), jadi di Windows
// pakai shell:true. Argumennya di-hardcode di sini (bukan dari input pengguna),
// jadi tidak ada risiko injeksi perintah.
let buildOk = true;
try {
  execFileSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'ignore',
    env: {
      ...process.env,
      VITE_ROUTER_BASENAME: PROD_BASENAME,
      VITE_RECAPTCHA_PROVIDER: PROD_PROVIDER,
      VITE_USE_EMULATORS: 'false'
    },
    ...(process.platform === 'win32' ? { shell: true } : {})
  });
} catch {
  // Build gagal (mis. `base` salah sintaks). Tetap laporkan sebagai [FAIL]
  // supaya output test tetap bisa dibaca, bukan stack trace mentah.
  buildOk = false;
}
check('build produksi berjalan', buildOk);

const distIndex = path.join(root, 'dist', 'index.html');
check('dist/index.html terbentuk', existsSync(distIndex));
const html = existsSync(distIndex) ? readFileSync(distIndex, 'utf8') : '';
const notFound = path.join(root, 'dist', '404.html');

// 1. CSP harus benar-benar ada di build.
const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
check('CSP ter-inject ke dist/index.html', Boolean(csp));
if (csp) {
  const policy = csp[1];
  for (const dir of ['default-src', 'object-src', 'frame-ancestors', 'script-src', 'connect-src']) {
    check(`CSP punya direktif ${dir}`, policy.includes(dir));
  }
  // Domain yang dibutuhkan App Check / reCAPTCHA harus diizinkan.
  check('CSP connect-src mengizinkan appcheck.googleapis.com', policy.includes('appcheck.googleapis.com'));
  check('CSP connect-src mengizinkan firebaseappcheck.googleapis.com', policy.includes('firebaseappcheck.googleapis.com'));
  check('CSP script-src mengizinkan www.google.com (reCAPTCHA)', policy.includes('www.google.com'));
  check('CSP connect-src mengizinkan www.google.com/recaptcha/', policy.includes('www.google.com/recaptcha/'));
}

// 2. Fallback BrowserRouter untuk GitHub Pages.
check('dist/404.html ada (fallback deep link)', existsSync(notFound));

// 3. Path aset harus absolut dengan prefix produksi — inilah yang bikin deep link
//    putih. Dulu hanya dicek "bukan relatif", sehingga base '/belajar-bersama/'
//    yang dipakai workflow tidak pernah benar-benar diuji.
const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]*)"/g)].map((m) => m[1]);
check('ada referensi aset di dist/index.html', assets.length > 0, String(assets.length));
const relative = assets.filter((a) => a.startsWith('./') || a.startsWith('../'));
check('path aset absolut (bukan ./assets)', relative.length === 0, relative.join(', '));
const wrongBase = assets.filter((a) => !a.startsWith(`${PROD_BASENAME}/assets/`));
check(
  `seluruh aset berawalan ${PROD_BASENAME}/assets/`,
  wrongBase.length === 0,
  wrongBase.join(', ')
);
// Aset tak boleh ikut prepend base berulang (mis. /belajar-bersama/belajar-bersama/…)
const doubled = assets.filter((a) => a.startsWith(`${PROD_BASENAME}${PROD_BASENAME}/`));
check('tidak ada base yang terduplikasi', doubled.length === 0, doubled.join(', '));

// 3b. basename BrowserRouter harus ikut ter-bundle, kalau tidak semua route
//     tidak akan cocok dengan URL GitHub Pages.
const jsFiles = readdirSync(path.join(root, 'dist', 'assets')).filter((f) => f.endsWith('.js'));
const bundle = jsFiles.map((f) => readFileSync(path.join(root, 'dist', 'assets', f), 'utf8')).join('\n');
check('basename router ter-bundle ke JS', bundle.includes(PROD_BASENAME));

// 4. App Check WAJIB reCAPTCHA Enterprise di produksi.
//    Regresi nyata (2026-09-27): fallback provider pernah 'v3' sementara
//    VITE_RECAPTCHA_PROVIDER tidak pernah diisi di env/workflow, sehingga
//    produksi diam-diam memakai reCAPTCHA v3 dengan key Enterprise.
check(
  'fallback provider produksi adalah enterprise',
  DEFAULT_RECAPTCHA_PROVIDER === 'enterprise',
  `default=${DEFAULT_RECAPTCHA_PROVIDER}`
);
for (const [label, raw] of [
  ['kosong (env tak diisi)', ''],
  ['hanya spasi', '   '],
  ['tidak dikenal', 'entprise'],
  ['salah ketik', 'enterprize']
]) {
  check(
    `provider tidak dikenal (${label}) tetap enterprise`,
    resolveRecaptchaProvider(raw) === 'enterprise',
    resolveRecaptchaProvider(raw)
  );
}
check(
  'provider "v3" eksplisit tetap dihormati (escape hatch, bukan default)',
  resolveRecaptchaProvider('v3') === 'v3'
);
check(
  'provider produksi yang dipakai build = enterprise',
  resolveRecaptchaProvider(PROD_PROVIDER) === 'enterprise'
);

// 5. Konfigurasi yang mengikat build produksi di CI harus mengirim provider.
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'deploy-pages.yml'), 'utf8');
check(
  'workflow mengirim VITE_RECAPTCHA_PROVIDER dari repository variable',
  /VITE_RECAPTCHA_PROVIDER:\s*\$\{\{\s*vars\.VITE_RECAPTCHA_PROVIDER\s*\}\}/.test(workflow)
);
check(
  `workflow mengunci VITE_ROUTER_BASENAME = '${PROD_BASENAME}'`,
  new RegExp(`VITE_ROUTER_BASENAME:\\s*'${PROD_BASENAME}'`).test(workflow)
);

// 6. Nilai provider di file env contoh harus enterprise, bukan v3 — kalau
//    developer menyalin .env.example, dokumentasi tidak boleh menyesatkan.
const envExample = readFileSync(path.join(root, '.env.example'), 'utf8');
const exampleProvider = envExample.match(/^VITE_RECAPTCHA_PROVIDER=(.*)$/m);
check(
  '.env.example memakai VITE_RECAPTCHA_PROVIDER=enterprise',
  Boolean(exampleProvider) && exampleProvider[1].trim() === 'enterprise',
  exampleProvider ? exampleProvider[1].trim() : '(tidak ada)'
);

const failed = results.filter((r) => !r.ok);
console.log('\n' + '-'.repeat(66));
console.log(`Total ${results.length} · LULUS ${results.length - failed.length} · GAGAL ${failed.length}`);
if (failed.length) process.exitCode = 1;
