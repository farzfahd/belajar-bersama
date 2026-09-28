// Validasi FilterPanel di browser sungguhan: sheet (mobile) & popover (desktop),
// dark & light. Bukan snapshot DOM — perilaku nyata yang diperiksa:
//   - toolbar tidak lagi deretan select & tidak terpotong
//   - badge bertambah sesuai filter aktif; sortBy TIDAK ikut dihitung
//   - Reset mengembalikan default TANPA menutup panel
//   - Escape / backdrop / klik-luar menutup; fokus kembali ke trigger
//   - popover tidak keluar viewport (collision detection)
//   - sheet mengunci scroll body
// Prasyarat: emulator + `npm run dev` hidup di 127.0.0.1:5173.
// Jalankan: node tests/filter-panel-check.mjs [--keep-screens]

import { connect, sleep } from './helpers/cdp.mjs';

const APP = process.env.E2E_APP_URL || 'http://127.0.0.1:5173';
const PORT = Number(process.env.E2E_CDP_PORT || 9412);
const EMAIL = process.env.E2E_EMAIL || 'alfahdphotograph@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD || 'asdfasdfadsf';
const KEEP = process.argv.includes('--keep-screens');

const TRIGGER = '[aria-haspopup="dialog"]';
const PANEL = '[role="dialog"]';

const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok });
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${info ? '  -> ' + info : ''}`);
}

// Helper in-page: ubah select seperti pengguna, klik tombol ber-teks, dsb.
const HELPERS = `
  window.setSelect = function (i, optIdx) {
    var p = document.querySelector('${PANEL}');
    var s = p.querySelectorAll('select')[i];
    var o = s.options[Math.min(optIdx, s.options.length - 1)];
    var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(s, o.value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return o.value;
  };
  window.clickText = function (re) {
    var p = document.querySelector('${PANEL}');
    var b = Array.from(p.querySelectorAll('button')).find(function (x) { return re.test(x.innerText); });
    if (!b) return false;
    b.click();
    return true;
  };
  window.trigger = function () { document.querySelector('${TRIGGER}').click(); return true; };
  window.badge = function () { return (document.querySelector('${TRIGGER}').innerText || '').trim(); };
  window.esc = function () {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  };
  // Filter yang MEMILIKI opsi (selain "Semua ..."). Ruang uji bisa belum punya
  // topik/tag sama sekali, jadi tidak boleh mengasumsikan index tertentu punya
  // pilihan — kalau tidak, setSelect diam-diam tidak mengubah apa pun dan
  // tes badge ikut berbohong.
  window.activeSelects = function () {
    var p = document.querySelector('${PANEL}');
    return Array.from(p.querySelectorAll('select'))
      .map(function (s, i) { return { i: i, n: s.options.length }; })
      .filter(function (x) { return x.n > 1; })
      .map(function (x) { return x.i; });
  };
  window.setFirstTwo = function () {
    var idx = activeSelects();
    if (idx.length < 2) return -1;
    setSelect(idx[0], 1);
    return idx[0];
  };
  window.setFirstOne = function () {
    var idx = activeSelects();
    if (!idx.length) return -1;
    setSelect(idx[0], 1);
    return idx[0];
  };
  true;
`;
const setSelect = (i, o) => `setSelect(${i}, ${o})`;

const setTheme = (t) =>
  `document.documentElement.setAttribute('data-theme', ${JSON.stringify(t)}); true`;

async function desktop(cdp) {
  // Tunggu elemen muncul, jangan memakai sleep tetap: halaman memuat data
  // Firestore secara asinkron, jadi toolbar bisa belum ada beberapa ratus ms
  // setelah navigasi.
  async function waitFor(expr, label, tries = 30) {
    for (let i = 0; i < tries; i++) {
      if (await cdp.ev(`!!(${expr})`)) return true;
      await sleep(400);
    }
    check(`menunggu: ${label}`, false, `timeout setelah ${tries * 400}ms`);
    return false;
  }
  const waitTrigger = () => waitFor(`document.querySelector('${TRIGGER}')`, 'tombol filter');

  await cdp.viewport(1280, 900);
  await cdp.ev(setTheme('dark'));
  await cdp.go(`${APP}/learn?tab=notes`);
  await waitTrigger();
  await cdp.ev(HELPERS);

  const bar = await cdp.json(`(function(){
    var b = document.querySelector('main .flex.flex-wrap.items-center');
    if (!b) return null;
    return { selects: b.querySelectorAll('select').length,
             trigger: !!b.querySelector('${TRIGGER}'),
             overflow: b.scrollWidth > b.clientWidth + 1,
             text: (b.innerText||'').replace(/\\s+/g,' ').trim().slice(0,70) };
  })()`);
  check('desktop: toolbar tidak lagi deretan select', bar?.selects === 0, `select=${bar?.selects}`);
  check('desktop: tombol filter ada', !!bar?.trigger);
  check('desktop: toolbar tidak terpotong', bar?.overflow === false, `"${bar?.text}"`);
  check('desktop: badge kosong tanpa filter aktif', (await cdp.ev(`badge()`)) === '');

  await cdp.ev(`trigger()`);
  await sleep(700);
  const pop = await cdp.json(`(function(){
    var p = document.querySelector('${PANEL}'); if (!p) return null;
    var r = p.getBoundingClientRect();
    var t = document.querySelector('${TRIGGER}').getBoundingClientRect();
    return { w: Math.round(r.width), below: r.top >= t.bottom - 1,
             overflowX: r.left < 0 || r.right > window.innerWidth,
             overflowY: r.top < 0 || r.bottom > window.innerHeight,
             selects: p.querySelectorAll('select').length,
             labels: Array.from(p.querySelectorAll('.eyebrow')).map(function(e){return e.textContent.trim();}),
             hasApply: /Terapkan/.test(p.innerText),
             focusIn: p.contains(document.activeElement) };
  })()`);
  check('desktop: popover tepat di bawah tombol', pop?.below === true);
  check('desktop: lebar 320px', pop?.w === 320, `w=${pop?.w}`);
  check('desktop: popover tidak keluar viewport', pop?.overflowX === false && pop?.overflowY === false);
  check('desktop: 6 filter di panel', pop?.selects === 6, `selects=${pop?.selects}`);
  check('desktop: tiap filter berlabel', pop?.labels?.length === 6, JSON.stringify(pop?.labels));
  check('desktop: tidak ada tombol Terapkan', pop?.hasApply === false);
  check('desktop: fokus masuk panel', pop?.focusIn === true);
  if (KEEP) await cdp.shot('fp-desktop-dark.png');

  // Dua filter aktif (live) -> badge 2. "Urutkan" sengaja TIDAK dihitung, jadi
  // mengubahnya tidak boleh menaikkan badge.
  // Tiap filter diubah pada tick TERPISAH: dua setState dalam satu evaluate
  // akan di-batch React sehingga badge dinilai sebelum render ulang.
  const picks = await cdp.json(`activeSelects()`);
  check('desktop: ada >=2 filter dengan opsi nyata', (picks?.length || 0) >= 2, JSON.stringify(picks));
  if ((picks?.length || 0) >= 2) {
    await cdp.ev(`${setSelect(picks[0], 1)}; true`);
    await sleep(500);
    await cdp.ev(`${setSelect(picks[1], 1)}; true`);
    await sleep(500);
    check('desktop: badge = 2 setelah 2 filter aktif', (await cdp.ev(`badge()`)) === '2', await cdp.ev(`badge()`));
  }
  // "Urutkan" = select terakhir; mengubahnya tidak boleh menambah badge.
  await cdp.ev(`${setSelect(5, 1)}; true`);
  await sleep(500);
  check('desktop: sortBy tidak menambah badge', (await cdp.ev(`badge()`)) !== '3', await cdp.ev(`badge()`));
  await cdp.ev(`${setSelect(5, 0)}; true`);
  await sleep(400);

  await cdp.key('Escape');
  const afterEsc = await cdp.json(`({
    panel: !!document.querySelector('${PANEL}'),
    focusOnTrigger: document.activeElement === document.querySelector('${TRIGGER}'),
    badge: badge() })`);
  check('desktop: Escape menutup popover', afterEsc.panel === false);
  check('desktop: fokus kembali ke trigger', afterEsc.focusOnTrigger === true);
  check('desktop: filter tetap tersimpan', afterEsc.badge === '2', `badge="${afterEsc.badge}"`);

  await cdp.ev(`trigger()`);
  await sleep(600);
  // Dispatch mousedown (bukan .click()) supaya persis seperti klik sungguhan:
  // penutup luar memakai event 'mousedown', sedangkan .click() tidak
  // menghasilkannya.
  await cdp.ev(`(function(){
    var n = document.querySelector('main h1');
    if (!n) return false;
    n.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return true;
  })()`);
  await sleep(500);
  check('desktop: klik di luar menutup', (await cdp.ev(`!document.querySelector('${PANEL}')`)) === true);

  await cdp.ev(`trigger()`);
  await sleep(600);
  await cdp.ev(`clickText(/Reset/)`);
  await sleep(600);
  const afterReset = await cdp.json(`({ open: !!document.querySelector('${PANEL}'), badge: badge() })`);
  check('desktop: Reset tidak menutup panel', afterReset.open === true);
  check('desktop: Reset mengembalikan badge ke 0', afterReset.badge === '', `badge="${afterReset.badge}"`);
  await cdp.ev(`esc()`);
  await sleep(500); // > DUR_POP (130ms)

  // Collision detection: viewport sempit.
  await cdp.viewport(900, 700);
  await cdp.go(`${APP}/learn?tab=notes`);
  await waitTrigger();
  await cdp.ev(HELPERS);
  await cdp.ev(`trigger()`);
  await sleep(700);
  const narrow = await cdp.json(`(function(){
    var p = document.querySelector('${PANEL}'); if(!p) return null;
    var r = p.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth,
             ok: r.left >= 0 && r.right <= window.innerWidth };
  })()`);
  check('desktop sempit: popover tidak meluber', narrow?.ok === true, `left=${narrow?.left} right=${narrow?.right} vw=${narrow?.vw}`);
  await cdp.ev(`esc()`);
  await sleep(400);

  // ---- Exit animation: panel HARUS tetap di DOM sambil animasi keluar ----
  // Kalau langsung unmount, animasi tidak pernah terlihat sama sekali.
  await cdp.ev(`trigger()`);
  await sleep(700);
  const animName = await cdp.ev(`(function(){
    var p = document.querySelector('${PANEL}'); if (!p) return null;
    return getComputedStyle(p).animationName;
  })()`);
  check('desktop: animasi MASUK terpasang', /pop-rise/.test(String(animName)), String(animName));

  await cdp.ev(`esc()`);
  await sleep(60); // di tengah animasi (120ms)
  const midExit = await cdp.json(`(function(){
    var p = document.querySelector('${PANEL}');
    if (!p) return { present: false };
    var cs = getComputedStyle(p);
    return { present: true, name: cs.animationName, opacity: cs.opacity,
             bodyLocked: getComputedStyle(document.body).overflow === 'hidden' };
  })()`);
  check('desktop: panel masih ada saat animasi keluar', midExit?.present === true);
  check('desktop: animasi KELUAR terpasang', /pop-fade/.test(String(midExit?.name)), String(midExit?.name));
  check('desktop: opacity menurun saat keluar', Number(midExit?.opacity) < 1, `opacity=${midExit?.opacity}`);
  await sleep(500);
  check('desktop: panel di-unmount setelah animasi', (await cdp.ev(`!document.querySelector('${PANEL}')`)) === true);
  check('desktop: aria-expanded false setelah keluar', (await cdp.ev(`document.querySelector('${TRIGGER}').getAttribute('aria-expanded')`)) === 'false');
  check('desktop: fokus kembali ke trigger setelah keluar', (await cdp.ev(`document.activeElement === document.querySelector('${TRIGGER}')`)) === true);

  // Klik lagi saat animasi keluar -> batal, panel tetap terbuka.
  await cdp.ev(`trigger()`);
  await sleep(600);
  await cdp.ev(`esc()`);
  await sleep(50);
  await cdp.ev(`trigger()`);
  await sleep(300);
  const cancel = await cdp.json(`({
    present: !!document.querySelector('${PANEL}'),
    name: (function(){ var p=document.querySelector('${PANEL}'); return p ? getComputedStyle(p).animationName : null; })(),
    expanded: document.querySelector('${TRIGGER}').getAttribute('aria-expanded') })`);
  check('desktop: klik saat keluar membatalkan animasi', cancel?.present === true && /pop-rise/.test(String(cancel?.name)), JSON.stringify(cancel));
  await cdp.ev(`esc()`);
  await sleep(500);

  // Light mode.
  await cdp.ev(setTheme('light'));
  await sleep(400);
  await cdp.ev(`trigger()`);
  await sleep(700);
  const light = await cdp.json(`({
    theme: document.documentElement.getAttribute('data-theme'),
    panelBg: getComputedStyle(document.querySelector('${PANEL}')).backgroundColor,
    bodyBg: getComputedStyle(document.body).backgroundColor })`);
  check('desktop light: tema berubah & panel kontras', light.theme === 'light' && light.panelBg !== light.bodyBg, JSON.stringify(light));
  if (KEEP) await cdp.shot('fp-desktop-light.png');
  await cdp.ev(`esc()`);
  await sleep(500); // > DUR_POP (130ms)
  await cdp.ev(setTheme('dark'));
  await sleep(300);
}

async function mobile(cdp) {
  async function waitFor(expr, label, tries = 30) {
    for (let i = 0; i < tries; i++) {
      if (await cdp.ev(`!!(${expr})`)) return true;
      await sleep(400);
    }
    check(`menunggu: ${label}`, false, `timeout setelah ${tries * 400}ms`);
    return false;
  }
  const waitTrigger = () => waitFor(`document.querySelector('${TRIGGER}')`, 'tombol filter');

  await cdp.viewport(390, 780);
  await cdp.ev(setTheme('dark'));
  await cdp.go(`${APP}/learn?tab=notes`);
  await waitTrigger();
  await cdp.ev(HELPERS);

  const bar = await cdp.json(`(function(){
    var b = document.querySelector('main .flex.flex-wrap.items-center');
    if (!b) return null;
    return { selects: b.querySelectorAll('select').length,
             overflow: b.scrollWidth > b.clientWidth + 1,
             text: (b.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60) };
  })()`);
  check('mobile: toolbar tidak punya deretan select', bar?.selects === 0, `select=${bar?.selects}`);
  check('mobile: toolbar tidak terpotong', bar?.overflow === false, `"${bar?.text}"`);

  await cdp.ev(`trigger()`);
  await sleep(800);
  const sh = await cdp.json(`(function(){
    var p = document.querySelector('${PANEL}'); if(!p) return null;
    var r = p.getBoundingClientRect();
    var cs = getComputedStyle(p);
    return { bottomAnchored: Math.abs(r.bottom - window.innerHeight) <= 1,
             fullWidth: Math.abs(r.left) <= 1 && Math.abs(r.width - window.innerWidth) <= 1,
             radius: cs.borderTopLeftRadius, bg: cs.backgroundColor,
             handle: !!p.parentElement.querySelector('span.rounded-full'),
             selects: p.querySelectorAll('select').length,
             hasApply: /Terapkan/.test(p.innerText), hasReset: /Reset/.test(p.innerText),
             bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
             focusIn: p.contains(document.activeElement) };
  })()`);
  check('mobile: sheet menempel di bawah layar', sh?.bottomAnchored === true);
  check('mobile: sheet selebar layar', sh?.fullWidth === true, `radius atas=${sh?.radius}`);
  check('mobile: handle bar ada', sh?.handle === true);
  check('mobile: 6 filter di sheet', sh?.selects === 6, `selects=${sh?.selects}`);
  check('mobile: tombol Reset + Terapkan ada', !!(sh?.hasReset && sh?.hasApply));
  check('mobile: scroll body terkunci', sh?.bodyLocked === true);
  check('mobile: fokus masuk sheet', sh?.focusIn === true);
  if (KEEP) await cdp.shot('fp-mobile-dark.png');

  // Reset di dalam sheet: tidak menutup, badge kembali 0.
  const mIdx = (await cdp.json(`activeSelects()`))?.[0];
  check('mobile: ada filter dengan opsi nyata', mIdx !== undefined, `index=${mIdx}`);
  if (mIdx !== undefined) {
    await cdp.ev(`${setSelect(mIdx, 1)}; true`);
    await sleep(500);
    check('mobile: badge = 1 setelah 1 filter aktif', (await cdp.ev(`badge()`)) === '1', await cdp.ev(`badge()`));
  }
  await cdp.ev(`clickText(/Reset/)`);
  await sleep(600);
  const afterReset = await cdp.json(`({ open: !!document.querySelector('${PANEL}'), badge: badge() })`);
  check('mobile: Reset tidak menutup sheet', afterReset.open === true);
  check('mobile: Reset mengembalikan badge ke 0', afterReset.badge === '', `badge="${afterReset.badge}"`);

  // Terapkan menutup, filter tersimpan.
  if (mIdx !== undefined) {
    await cdp.ev(`${setSelect(mIdx, 1)}; true`);
    await sleep(500);
  }
  await cdp.ev(`clickText(/Terapkan/)`);
  await sleep(700); // > DUR_SHEET (170ms) agar animasi keluar selesai
  const afterApply = await cdp.json(`({
    panel: !!document.querySelector('${PANEL}'),
    badge: badge(),
    bodyOverflow: getComputedStyle(document.body).overflow,
    focusOnTrigger: document.activeElement === document.querySelector('${TRIGGER}') })`);
  check('mobile: Terapkan menutup sheet', afterApply.panel === false);
  check('mobile: badge = 1 setelah filter disimpan', afterApply.badge === '1', `badge="${afterApply.badge}"`);
  check('mobile: scroll body kembali normal', afterApply.bodyOverflow !== 'hidden', `overflow=${afterApply.bodyOverflow}`);
  check('mobile: fokus kembali ke trigger', afterApply.focusOnTrigger === true);

  // Backdrop menutup.
  await cdp.ev(`trigger()`);
  await sleep(700);
  await cdp.ev(`(function(){ var b=document.querySelector('.sheet-backdrop'); if(!b) return false; b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); return true; })()`);
  await sleep(700); // > DUR_SHEET (170ms)
  check('mobile: backdrop menutup sheet', (await cdp.ev(`!document.querySelector('${PANEL}')`)) === true);

  // ---- Exit animation sheet: sheet turun ke bawah, dan scroll lock baru
  //      lepas SETELAH animasi selesai (lepas lebih awal = halaman melompat). ----
  await cdp.ev(`trigger()`);
  await sleep(800);
  const sheetIn = await cdp.ev(`getComputedStyle(document.querySelector('${PANEL}')).animationName`);
  check('mobile: animasi MASUK sheet terpasang', /sheet-rise/.test(String(sheetIn)), String(sheetIn));
  await cdp.ev(`esc()`);
  await sleep(60); // di tengah animasi (160ms)
  const sheetMid = await cdp.json(`(function(){
    var p = document.querySelector('${PANEL}');
    if (!p) return { present: false };
    var r = p.getBoundingClientRect();
    return { present: true, name: getComputedStyle(p).animationName,
             transform: getComputedStyle(p).transform,
             // Sheet sudah mulai bergerak ke bawah? (tidak lagi menempel)
             sunk: r.bottom > window.innerHeight + 1,
             bodyLocked: getComputedStyle(document.body).overflow === 'hidden' };
  })()`);
  check('mobile: sheet masih ada saat animasi keluar', sheetMid?.present === true);
  check('mobile: animasi KELUAR sheet terpasang', /sheet-sink/.test(String(sheetMid?.name)), String(sheetMid?.name));
  check('mobile: sheet bergerak turun saat keluar', sheetMid?.sunk === true, `transform=${sheetMid?.transform}`);
  check('mobile: scroll MASIH terkunci selama animasi keluar', sheetMid?.bodyLocked === true, `overflow=${sheetMid?.bodyLocked}`);
  await sleep(600);
  const sheetEnd = await cdp.json(`({
    present: !!document.querySelector('${PANEL}'),
    bodyOverflow: getComputedStyle(document.body).overflow,
    focusOnTrigger: document.activeElement === document.querySelector('${TRIGGER}') })`);
  check('mobile: sheet di-unmount setelah animasi', sheetEnd.present === false);
  check('mobile: scroll body baru lepas setelah animasi', sheetEnd.bodyOverflow !== 'hidden', `overflow=${sheetEnd.bodyOverflow}`);
  check('mobile: fokus kembali ke trigger setelah keluar', sheetEnd.focusOnTrigger === true);

  // Light mode sheet.
  await cdp.ev(setTheme('light'));
  await sleep(400);
  await cdp.ev(`trigger()`);
  await sleep(800);
  if (KEEP) await cdp.shot('fp-mobile-light.png');
  check('mobile light: sheet terbuka di tema light', (await cdp.ev(`document.documentElement.getAttribute('data-theme')==='light' && !!document.querySelector('${PANEL}')`)) === true);
  await cdp.ev(`esc()`);
  await sleep(400);
  await cdp.ev(setTheme('dark'));

  // Resources memakai komponen yang sama (reuse, bukan duplikasi).
  await cdp.go(`${APP}/learn?tab=resources`);
  await waitTrigger();
  await cdp.ev(HELPERS);
  await sleep(600);
  const rp = await cdp.json(`(function(){
    var b = document.querySelector('main .flex.flex-wrap.items-center');
    return { trigger: !!(b && b.querySelector('${TRIGGER}')), selects: b ? b.querySelectorAll('select').length : -1 };
  })()`);
  check('resources: memakai FilterPanel yang sama', rp?.trigger === true && rp?.selects === 0, JSON.stringify(rp));
  await cdp.ev(`trigger()`);
  await sleep(700);
  const rf = await cdp.json(`(function(){
    var p = document.querySelector('${PANEL}'); if(!p) return null;
    return { n: p.querySelectorAll('select').length,
             labels: Array.from(p.querySelectorAll('.eyebrow')).map(function(e){return e.textContent.trim();}) };
  })()`);
  check('resources: 4 filter (topik/jenis/tag/status)', rf?.n === 4, JSON.stringify(rf?.labels));
  if (KEEP) await cdp.shot('fp-resources-dark.png');
}

async function main() {
  const cdp = await connect(PORT);
  try {
    await cdp.viewport(1280, 900);
    await cdp.go(`${APP}/login`);
    await cdp.ev(
      `(async () => {
         const m = await import('/src/features/auth/services/authService.js');
         await m.signIn(${JSON.stringify(EMAIL)}, ${JSON.stringify(PASSWORD)});
       })()`,
      true
    );
    await sleep(1500);
    await desktop(cdp);
    await mobile(cdp);
  } finally {
    cdp.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '-'.repeat(66));
  console.log(`Total ${results.length} · LULUS ${results.length - failed.length} · GAGAL ${failed.length}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exitCode = 1;
});
