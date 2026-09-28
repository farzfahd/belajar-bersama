// Harness alignment optik — mengukur TITIK PUSAT TINTA (ink center),
// bukan kotak elemen.
//
// Mengapa bukan kotak? `items-center` + `leading-none` membuat kotak ikon dan
// kotak teks sama tinggi & sama pusat, jadi selisihnya selalu 0.00px — tetapi
// mata manusia membandingkan TINTA: goresan ikon di dalam viewBox 24x24 dan
// tinggi kapital huruf di dalam line-box. Keduanya hampir selalu duduk tidak
// simetris di kotak masing-masing, jadi mengukur kotak = mengukur hal yang
// salah dan melaporkan "sejajar" padahal tidak.
//
// Metrik per elemen:
//   - ikon : svg.getBBox() (union geometri, user units) dipetakan ke piksel
//            layar lewat viewBox -> offset top + tinggi.
//   - teks : canvas TextMetrics. Cap center dihitung dari baseline -
//            tinggi kapital, dengan baseline = half-leading + fontBoundingBoxAscent.
//
// Selisih yang dicari: capCenterTeks - inkCenterIkon. Target |delta| < 0.6px.
//
// Prasyarat: emulator + `npm run dev` sudah hidup di 127.0.0.1:5173.
// Jalankan: node tests/layout-align.mjs [--keep-screens]

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = process.env.E2E_APP_URL || 'http://127.0.0.1:5173';
const CHROME_PORT = Number(process.env.E2E_CDP_PORT || 9402);
const CHROME_CANDIDATES = [
  process.env.E2E_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const EMAIL = process.env.E2E_EMAIL || 'alfahdphotograph@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD || 'asdfasdfadsf';
const KEEP_SHOTS = process.argv.includes('--keep-screens');
const TOLERANCE = 0.6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (c && existsSync(c)) return c;
  throw new Error('Chrome/Edge tidak ditemukan. Set E2E_CHROME.');
}

// ---------------------------------------------------------------- CDP client
async function connect() {
  const proc = spawn(
    findChrome(),
    [
      '--headless=new',
      `--remote-debugging-port=${CHROME_PORT}`,
      `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'align-'))}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1440,900',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  let targets = null;
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(250);
    try {
      targets = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${CHROME_PORT}/json`, (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => resolve(JSON.parse(d)));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => req.destroy(new Error('timeout')));
      });
    } catch {
      /* belum siap */
    }
  }
  if (!targets) throw new Error('DevTools tidak merespons');

  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 1;
  const pending = new Map();

  ws.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = seq++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true
    });
    if (r.exceptionDetails) {
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text
      );
    }
    return r.result.value;
  };

  return {
    evaluate,
    async goto(url) {
      await send('Page.navigate', { url });
      await sleep(1500);
    },
    async viewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      });
      await sleep(500);
    },
    async shot(file) {
      if (!KEEP_SHOTS) return;
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    close() {
      try {
        ws.close();
      } catch {
        /* sudah tertutup */
      }
      proc.kill();
    }
  };
}

// ------------------------------------------------------- in-page measuring
// Fungsi ini di-stringify lalu dikirim ke browser; tidak boleh memakai closure
// Node. Semua konstanta ditulis inline.
const IN_PAGE = `
window.__align = (function () {
  var ctx = document.createElement('canvas').getContext('2d');
  var cache = {};

  function fontOf(cs) {
    return (cs.fontStyle || 'normal') + ' ' + (cs.fontWeight || 400) + ' ' +
      cs.fontSize + ' ' + cs.fontFamily;
  }

  function metrics(font, text) {
    var key = font + '||' + text;
    if (cache[key]) return cache[key];
    ctx.font = font;
    var m = ctx.measureText(text || 'Hxg');
    var out = {
      ascent: m.fontBoundingBoxAscent,
      descent: m.fontBoundingBoxDescent,
      inkAscent: m.actualBoundingBoxAscent
    };
    cache[key] = out;
    return out;
  }

  // Titik pusat tinta ikon: union geometri SVG dipetakan ke layar.
  function iconInk(svg) {
    if (!svg) return null;
    var box;
    try { box = svg.getBBox(); } catch (e) { return null; }
    if (!box || (!box.width && !box.height)) return null;
    var r = svg.getBoundingClientRect();
    if (!r.height) return null;
    var vb = svg.viewBox && svg.viewBox.baseVal;
    var vw = vb && vb.width ? vb.width : 24;
    var vh = vb && vb.height ? vb.height : 24;
    var vx = vb ? vb.x : 0;
    var vy = vb ? vb.y : 0;
    var sy = r.height / vh;
    // Setengah lebar stroke di sekeliling geometri supaya fair dibanding teks.
    var sw = (parseFloat(getComputedStyle(svg).strokeWidth) || 0) / 2;
    var top = r.top + (box.y - vy - sw) * sy;
    var bottom = r.top + (box.y + box.height - vy + sw) * sy;
    return { top: top, bottom: bottom, center: (top + bottom) / 2, h: bottom - top };
  }

  // Titik pusat tinggi kapital teks (bukan kotak line-nya).
  function textCap(el) {
    if (!el) return null;
    var text = (el.textContent || '').trim();
    if (!text) return null;
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    if (!r.height) return null;
    var lineHeight = parseFloat(cs.lineHeight);
    if (!isFinite(lineHeight)) lineHeight = parseFloat(cs.fontSize) * 1.6;
    var mt = metrics(fontOf(cs), text);
    var halfLeading = (lineHeight - (mt.ascent + mt.descent)) / 2;
    var baseline = halfLeading + mt.ascent;   // dari atas line-box
    // Batasi tinggi tinta ke atas baseline: label nav tidak punya descender
    // ("Dashboard", "Learn", ...) jadi cap center = tengah antara puncak
    // kapital dan baseline.
    var cap = Math.min(mt.inkAscent, baseline);
    var top = r.top + baseline - cap;
    var bottom = r.top + baseline;
    return { top: top, bottom: bottom, center: top + cap / 2, h: cap };
  }

  // Satu baris = satu pasangan (ikon, teks) di dalam root yang sama.
  function row(root, iconSel, textSel) {
    if (!root) return null;
    var icon = root.querySelector(iconSel);
    var text = root.querySelector(textSel);
    var a = iconInk(icon);
    var b = textCap(text);
    if (!a || !b) return null;
    return {
      label: (text.textContent || '').trim().slice(0, 18),
      delta: +(b.center - a.center).toFixed(2),
      iconInkH: +a.h.toFixed(2),
      capH: +b.h.toFixed(2)
    };
  }

  function all(rootSel, iconSel, textSel) {
    return Array.prototype.map
      .call(document.querySelectorAll(rootSel), function (r) {
        return row(r, iconSel, textSel);
      })
      .filter(Boolean);
  }

  // Ikon di dalam kotak tombol: apakah tinta ikonnya benar di tengah kotak?
  function iconInButton(sel) {
    return Array.prototype.map
      .call(document.querySelectorAll(sel), function (b) {
        var ink = iconInk(b.querySelector('svg'));
        var r = b.getBoundingClientRect();
        if (!ink) return null;
        return {
          label: b.getAttribute('aria-label') || 'icon-btn',
          delta: +(ink.center - (r.top + r.height / 2)).toFixed(2)
        };
      })
      .filter(Boolean);
  }

  return { row: row, all: all, textCap: textCap, iconInk: iconInk, iconInButton: iconInButton };
})();
true;
`;

// ------------------------------------------------------------------ laporan
const results = [];
function report(group, name, delta, extra) {
  const ok = Math.abs(delta) <= TOLERANCE;
  results.push({ group, name, delta, ok });
  console.log(
    `${ok ? '[OK]  ' : '[FAIL]'} ${group} · ${name}  Δ=${delta > 0 ? '+' : ''}${delta}px` +
      (extra ? '  ' + extra : '')
  );
}
function reportAll(group, json, withSize) {
  for (const r of JSON.parse(json)) {
    report(group, r.label, r.delta, withSize ? `ikon ${r.iconInkH}px / kapital ${r.capH}px` : '');
  }
}

async function main() {
  const cdp = await connect();
  try {
    await cdp.viewport(1440, 900);
    await cdp.goto(`${APP}/login`);
    await cdp.evaluate(IN_PAGE);

    await cdp.evaluate(
      `(async () => {
         const m = await import('/src/features/auth/services/authService.js');
         await m.signIn(${JSON.stringify(EMAIL)}, ${JSON.stringify(PASSWORD)});
         localStorage.setItem('lb:railExpanded', 'true');
       })()`,
      true
    );
    await sleep(1800);

    const signedIn = await cdp.evaluate(
      `(async () => {
         const fb = await import('/src/lib/firebase.js');
         return fb.auth.currentUser ? fb.auth.currentUser.email : null;
       })()`,
      true
    );
    if (!signedIn) {
      console.error('GAGAH masuk. Cek E2E_EMAIL / E2E_PASSWORD.');
      process.exitCode = 1;
      return;
    }
    console.log(`Masuk sebagai ${signedIn}\n`);

    // ---------- Sidebar rail LEBAR ----------
    await cdp.viewport(1440, 900);
    await cdp.goto(`${APP}/dashboard`);
    await cdp.evaluate(IN_PAGE);
    await sleep(900);
    reportAll(
      'sidebar-lebar',
      await cdp.evaluate(
        `JSON.stringify(window.__align.all('aside nav a', 'svg', '.rail-label'))`
      ),
      true
    );
    await cdp.shot('align-sidebar-lebar.png');

    // Badge "nanti" dibandingkan terhadap label di sebelahnya.
    reportAll(
      'sidebar-badge',
      await cdp.evaluate(
        `JSON.stringify(Array.prototype.map.call(
           document.querySelectorAll('aside nav a'),
           function (a) {
             var l = a.querySelectorAll('.rail-label');
             if (l.length < 2) return null;
             var t = window.__align.textCap(l[0]);
             var b = window.__align.textCap(l[1]);
             if (!t || !b) return null;
             return { label: 'nanti @ ' + (l[0].textContent || '').trim().slice(0, 12),
                      delta: +(b.center - t.center).toFixed(2) };
           }
         ).filter(Boolean))`
      )
    );

    // ---------- Sidebar rail CIUT: tinta ikon di tengah baris ----------
    await cdp.evaluate(`localStorage.setItem('lb:railExpanded', 'false'); true`);
    await cdp.goto(`${APP}/dashboard`);
    await cdp.evaluate(IN_PAGE);
    await sleep(800);
    reportAll(
      'sidebar-ciut',
      await cdp.evaluate(
        `JSON.stringify(window.__align.iconInButton('aside nav a'))`
      )
    );

    // ---------- Mobile: bottom-nav + drawer ----------
    await cdp.viewport(420, 860);
    await cdp.goto(`${APP}/dashboard`);
    await cdp.evaluate(IN_PAGE);
    await sleep(800);
    reportAll(
      'bottom-nav',
      await cdp.evaluate(
        `JSON.stringify(window.__align.all(
           'nav[aria-label="Navigasi utama mobile"] a', 'svg', 'span'))`
      ),
      true
    );
    await cdp.shot('align-bottomnav.png');

    await cdp.evaluate(`document.querySelector('button[aria-label="Buka menu"]').click(); true`);
    await sleep(800);
    reportAll(
      'drawer',
      await cdp.evaluate(
        `JSON.stringify(window.__align.all('div[role="dialog"] nav a', 'svg', 'span.truncate'))`
      ),
      true
    );
    await cdp.shot('align-drawer.png');

    // ---------- PageHeader (desktop) ----------
    await cdp.viewport(1440, 900);
    for (const route of [
      '/learn',
      '/roadmap',
      '/quiz',
      '/settings',
      '/progress',
      '/achievements'
    ]) {
      await cdp.goto(`${APP}${route}`);
      await cdp.evaluate(IN_PAGE);
      await sleep(800);
      const res = await cdp.evaluate(
        `JSON.stringify(window.__align.row(document.querySelector('header.card'), 'svg', 'h1'))`
      );
      const r = JSON.parse(res);
      if (r) report('page-header', route, r.delta, `ikon ${r.iconInkH}px / kapital ${r.capH}px`);
      else console.log(`[SKIP] page-header · ${route} (tanpa ikon)`);
    }
    await cdp.shot('align-pageheader.png');

    // ---------- Topbar: ikon di dalam tombol ----------
    await cdp.goto(`${APP}/dashboard`);
    await cdp.evaluate(IN_PAGE);
    await sleep(800);
    reportAll(
      'topbar',
      await cdp.evaluate(
        `JSON.stringify(window.__align.iconInButton('header.sticky button.icon-btn'))`
      )
    );

    // ---------- ringkasan ----------
    const failed = results.filter((r) => !r.ok);
    console.log('\n' + '-'.repeat(68));
    console.log(
      `Total ${results.length} pasangan · LULUS ${results.length - failed.length} · GAGAL ${failed.length}`
    );
    if (failed.length) {
      const worst = [...failed]
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 14);
      console.log('Paling menyimpang:');
      for (const f of worst) console.log(`  ${f.group} · ${f.name}  Δ=${f.delta}px`);
    }
    console.log(`\nAmbang toleransi |Δ| ≤ ${TOLERANCE}px (titik pusat tinta).`);
    if (failed.length) process.exitCode = 1;
  } finally {
    cdp.close();
  }
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exitCode = 1;
});

