// Uji privasi dua akun: browser sungguhan (headless Chrome via CDP) + probe
// Firestore langsung memakai ID token asli.
//
// Prasyarat (dua proses terpisah, jangan start yang kedua bila sudah hidup):
//   npx firebase emulators:start --import .firebase/emulator-export --export-on-exit
//   npm run dev
// Jalankan: node tests/privacy-e2e.mjs
//
// Yang dibuktikan:
//   1. Rules benar-benar MENOLAK partner untuk konten privat (bukan sekadar
//      disembunyikan di UI) — dibaca lewat REST Firestore dengan ID token asli.
//   2. Query ganda yang dipakai useNotes/useResources tetap bisa membaca konten
//      shared, sedangkan query polos ditolak rules.
//   3. Halaman nyata (/learn, /notes/:id) tidak pernah memuat isi privat partner.
//   4. Pencarian global (CP2.7) tidak menjadi jalur bocor kedua: hasil &
//      chip tag privat partner tidak muncul, materi sendiri tetap bisa dicari.
//   5. Alur owner: soft-delete -> Sampah -> pulihkan masih berfungsi.
//
// Kebersihan: akun & ruang uji dihapus helper cleanup (hanya yang cocok pola
// email uji — lihat tests/helpers/cleanup-test-data.mjs).

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanupTestData, testEmail } from './helpers/cleanup-test-data.mjs';

const APP = process.env.E2E_APP_URL || 'http://127.0.0.1:5173';
const PROJECT = 'demo-learning-berdua';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9333);
const PASSWORD = 'UjiRahasia123!';

const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok });
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${info ? ` -> ${info}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Klien CDP minimal (Node >= 22 punya WebSocket global) ----------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
  }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('WebSocket CDP gagal dibuka'));
    });
    const cdp = new Cdp(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const slot = msg.id && cdp.pending.get(msg.id);
      if (!slot) return;
      cdp.pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(msg.error.message));
      else slot.resolve(msg.result);
    };
    return cdp;
  }
  send(method, params = {}, sessionId = null) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // `sessionId` adalah field TINGKAT ATAS pesan CDP (sebelah `params`),
      // bukan isi params. Kalau salah, Page.*/Runtime.* diarahkan ke target
      // browser dan gagal dengan "'Page.enable' wasn't found".
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.ws.send(JSON.stringify(message));
    });
  }
}

function findChrome() {
  const candidates = [
    process.env.E2E_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Browser Chrome/Edge tidak ditemukan (set E2E_CHROME).');
  return found;
}

async function waitForCdp(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* belum siap */
    }
    await sleep(250);
  }
  throw new Error('CDP tidak siap dalam 20 detik.');
}

// ---------- Skrip yang diinjeksi ke halaman ----------
// Memakai modul aplikasi apa adanya (Vite melayani /src/... di dev) sehingga
// jalur tulis yang diuji sama dengan jalur produksi.
const PAGE_BOOT = `
(function () {
  var PROJECT = ${JSON.stringify(PROJECT)};
  var FS = ${JSON.stringify(FS)};
  window.__M = { errors: [] };
  window.addEventListener('error', function (e) { window.__M.errors.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    window.__M.errors.push('rejection: ' + ((r && r.message) || String(r)));
  });
  var origError = console.error;
  console.error = function () {
    window.__M.errors.push('console.error: ' + Array.prototype.map.call(arguments, String).join(' '));
    origError.apply(console, arguments);
  };
  window.__M.mods = Promise.all([
    import('/src/lib/firebase.js'),
    import('/src/features/auth/services/authService.js'),
    import('/src/features/space/services/spaceService.js'),
    import('/src/features/notes/services/noteService.js'),
    import('/src/features/resources/services/resourceService.js'),
    import('/src/features/topics/services/topicService.js')
  ]).then(function (m) {
    window.__M.fb = m[0];
    window.__M.authSvc = m[1];
    window.__M.spaceSvc = m[2];
    window.__M.noteSvc = m[3];
    window.__M.resSvc = m[4];
    window.__M.topicSvc = m[5];
    return true;
  });
  function docsUrl(p) {
    return FS + '/v1/projects/' + PROJECT + '/databases/(default)/documents/' + p;
  }
  function authHeaders() {
    return { Authorization: 'Bearer ' + window.__M.token };
  }
  window.__M.refreshToken = function () {
    if (!window.__M.fb.auth.currentUser) return Promise.resolve(null);
    return window.__M.fb.auth.currentUser.getIdToken(true);
  };
  window.__M.fsGet = function (p) {
    return fetch(docsUrl(p), { headers: authHeaders() }).then(function (r) {
      return r.text().then(function (t) { return { status: r.status, text: t.slice(0, 200) }; });
    });
  };
  window.__M.fsList = function (p) {
    return window.__M.fsGet(p + '?pageSize=300&mask.fieldPaths=name');
  };
  // Modul dependency Firestore harus instance yang SAMA dengan app: Vite
  // menambahkan ?v=<hash> pada URL, jadi ambil URL yang benar dari sumber
  // modul yang sudah ditransformasi. Tanpa hash -> instance berbeda ->
  // "!expected FirebaseFirestore" dan tidak terhubung ke emulator.
  var fsDep = null;
  window.__M.loadFsSdk = function () {
    if (fsDep) return fsDep;
    fsDep = fetch('/src/lib/firebase.js')
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var key = '/node_modules/.vite/deps/firebase_firestore.js';
        var i = t.indexOf(key);
        if (i < 0) return import(key);
        var tail = t.slice(i + key.length).match(/^[?]v=[0-9a-zA-Z_-]+/);
        return import(tail ? key + tail[0] : key);
      });
    return fsDep;
  };

  // Baca dokumen lewat SDK (bukan REST) -> data mentah untuk memastikan
  // field visibility benar-benar tersimpan private/shared.
  window.__M.fsDocData = function (path) {
    var parts = path.split('/');
    return window.__M.loadFsSdk().then(function (m) {
      return import('/src/lib/firebase.js').then(function (f) {
        return m.getDoc(m.doc(f.db, ...parts)).then(function (s) {
          return { exists: s.exists(), data: s.exists() ? s.data() : null };
        });
      });
    });
  };

  // Query ganda lewat SDK Firestore yang sama dengan app (dependency Vite
  // yang sudah dioptimasi), meniru useNotes/useResources persis. Endpoint
  // REST :runQuery di emulator v1.19.8 menolak semua nilai from[].parent,
  // jadi jalur SDK dipakai supaya yang diuji memang query aplikasi.
  window.__M.fsDual = function (spaceId, coll, ownerField, withDeleted) {
    return window.__M.loadFsSdk().then(function (m) {
      return import('/src/lib/firebase.js').then(function (f) {
        var c = m.collection(f.db, 'spaces', spaceId, coll);
        var u = f.auth.currentUser.uid;
        var shared = withDeleted
          ? m.query(c, m.where('visibility', '==', 'shared'), m.where('deletedAt', '==', null))
          : m.query(c, m.where('visibility', '==', 'shared'));
        var own = m.query(c, m.where(ownerField, '==', u));
        return Promise.all([m.getDocs(shared), m.getDocs(own)]).then(function (r) {
          function ids(s) { return s.docs.map(function (d) { return d.id; }); }
          return { uid: u, shared: ids(r[0]), own: ids(r[1]) };
        });
      });
    });
  };
  window.__M.fsPatch = function (p, fields) {
    return fetch(docsUrl(p), {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ fields: fields })
    }).then(function (r) {
      return r.text().then(function (t) { return { status: r.status, text: t.slice(0, 200) }; });
    });
  };
  return true;
})();
`;

async function main() {
  const chrome = findChrome();
  const profile = mkdtempSync(path.join(tmpdir(), 'privacy-e2e-'));
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1280,900',
      // Offline: hanya 127.0.0.1 (emulator + dev server) boleh diakses.
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'
    ],
    { stdio: 'ignore' }
  );

  let cdp;
  try {
    cdp = await Cdp.connect(await waitForCdp(CDP_PORT));
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const raw = (method, params = {}) => cdp.send(method, params, sessionId);

    const evaluate = async (expression) => {
      const res = await raw('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) {
        throw new Error(
          res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'evaluate gagal'
        );
      }
      return res.result.value;
    };
    // Muat ulang halaman + pasang ulang jembatan modul & token.
    const openApp = async (route = '/') => {
      await raw('Page.navigate', { url: APP + route });
      await sleep(300);
      await evaluate(PAGE_BOOT);
      await evaluate('window.__M.mods');
      await evaluate(
        'window.__M.refreshToken().then(function (t) { window.__M.token = t; return true; })'
      );
    };
    // Ambil area konten saja (main) supaya teks nav tidak menutupi daftar.
    const bodyText = () =>
      evaluate('(document.querySelector("main") || document.body)?.innerText || ""');
    const waitForText = async (needle, timeoutMs = 15000) => {
      const deadline = Date.now() + timeoutMs;
      let last = '';
      while (Date.now() < deadline) {
        last = await bodyText();
        if (last.includes(needle)) return last;
        await sleep(300);
      }
      return last;
    };
    const clickButton = (pattern) =>
      evaluate(
        `(function () {
           var rx = ${pattern};
           var btn = Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
             return rx.test(b.innerText || '');
           });
           if (!btn) return false;
           btn.click();
           return true;
         })()`
      );

    // ---------- Global search (CP2.7) ----------
    // Dialog "Cari di ruang" memakai Modal, jadi teks diambil dari seluruh
    // body (bukan hanya <main>).
    const fullText = () => evaluate('document.body.innerText || ""');
    const openSearch = async () => {
      const clicked = await evaluate(
        `(function () {
           var b = document.querySelector('button[aria-label="Cari di ruang belajar"]');
           if (!b) return false;
           b.click();
           return true;
         })()`
      );
      if (!clicked) return false;
      const deadline = Date.now() + 10000;
      let last = '';
      while (Date.now() < deadline) {
        last = await fullText();
        if (last.includes('Cari di ruang')) return true;
        await sleep(300);
      }
      return false;
    };
    // Set nilai input React (native setter + event 'input').
    const typeSearch = (value) =>
      evaluate(
        `(function () {
           var el = document.getElementById('global-search-input');
           if (!el) return false;
           var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
           setter.call(el, ${JSON.stringify(value)});
           el.dispatchEvent(new Event('input', { bubbles: true }));
           return true;
         })()`
      );
    const clickTag = (tag) =>
      evaluate(
        `(function () {
           var want = ${JSON.stringify(tag)}.toLowerCase();
           var btn = Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
             // Chip dirender uppercase lewat CSS, jadi cocokkan tanpa case.
             return (b.innerText || '').trim().toLowerCase().indexOf('#' + want) === 0;
           });
           if (!btn) return false;
           btn.click();
           return true;
         })()`
      );
    const closeSearch = () =>
      evaluate(
        `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true`
      );
    // Tunggu sampai predicate terpenuhi (atau timeout), lalu kembalikan teks.
    const waitDialog = async (predicate, timeoutMs = 12000) => {
      const src = predicate.toString();
      const deadline = Date.now() + timeoutMs;
      let last = '';
      while (Date.now() < deadline) {
        last = await fullText();
        // eslint-disable-next-line no-new-func
        if (new Function('t', `return (${src})(t)`)(last)) return last;
        await sleep(300);
      }
      return last;
    };

    // Tunggu sampai Firestore client benar-benar terhubung lagi. Setelah
    // subscribe/unsubscribe banyak (dialog cari) webchannel kadang perlu
    // beberapa detik; tanpa ini probing berikutnya bisa "client is offline".
    const waitFirestore = async (p, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      let last = null;
      while (Date.now() < deadline) {
        last = await evaluate(
          `window.__M.fsGet(${JSON.stringify(p)}).catch(function (e) {
             return { status: 0, text: String((e && e.message) || e) };
           })`
        );
        if (last && last.status === 200) return last;
        await sleep(500);
      }
      return last;
    };
    const dualQuery = async (coll, ownerField, withDeleted) => {
      const call = `window.__M.fsDual(${JSON.stringify(spaceId)}, ${JSON.stringify(coll)}, ${JSON.stringify(ownerField)}, ${withDeleted})`;
      let out = await evaluate(`${call}.catch(function (e) { return { uid: '', shared: [], own: [], err: String(e.message) }; })`);
      // saturated: coba ulang sekali bila dual-listener belum berisi apa pun.
      if (!out?.shared?.length && !out?.own?.length) {
        await sleep(2000);
        out = await evaluate(`${call}.catch(function (e) { return { uid: '', shared: [], own: [], err: String(e.message) }; })`);
      }
      return out;
    };

    await raw('Page.enable');
    await raw('Runtime.enable');
    await openApp('/');

    const runId = Date.now();
    const emailA = testEmail('a', runId);
    const emailB = testEmail('b', runId);
    console.log(`\n[e2e] akun uji: ${emailA} / ${emailB}\n`);

    async function markVerified(uid) {
      const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update?key=${PROJECT}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: uid, emailVerified: true })
      });
      if (!res.ok) throw new Error(`tandai email terverifikasi gagal: ${res.status}`);
    }
    // Bikin akun (atau masuk lagi) lalu pastikan profil & token siap.
    async function enter(email) {
      const out = await evaluate(
        `window.__M.authSvc.signUp(${JSON.stringify(email)}, ${JSON.stringify(PASSWORD)}, 'Uji Privasi')
           .then(function () { return 'created'; })
           .catch(function (e) {
             if (e.code !== 'auth/email-already-in-use') return 'ERR ' + e.code;
             return window.__M.authSvc.signIn(${JSON.stringify(email)}, ${JSON.stringify(PASSWORD)})
               .then(function () { return 'signed-in'; })
               .catch(function (e2) { return 'ERR ' + e2.code; });
           })`
      );
      if (out.startsWith('ERR')) throw new Error(`auth ${email}: ${out}`);
      const uid = await evaluate('window.__M.fb.auth.currentUser.uid');
      if (out === 'created') await markVerified(uid);
      await evaluate(`window.__M.authSvc.ensureProfile(${JSON.stringify(uid)})`);
      await evaluate('window.__M.refreshToken().then(function (t) { window.__M.token = t; })');
      return out;
    }

    async function tokenClaims() {
      return evaluate(
        `window.__M.fb.auth.currentUser.getIdToken(true).then(function (t) {
           var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
           while (p.length % 4) p += '=';
           var c = JSON.parse(decodeURIComponent(escape(atob(p))));
           return JSON.stringify({ email_verified: c.email_verified, uid: c.user_id || c.sub });
         })`
      );
    }

    // createSpace menuntut klaim email_verified. Emulator kadang perlu
    // beberapa detik sampai klaim itu benar-benar masuk ke ID token, jadi
    // tandai + refresh token + ulangi (pola yang dipakai harness cp23).
    async function createSpace() {
      let last = 'ERR tidak ada percobaan';
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const uid = await evaluate('window.__M.fb.auth.currentUser.uid');
        await markVerified(uid);
        await evaluate(
          'window.__M.refreshToken().then(function (t) { window.__M.token = t; return true; })'
        );
        console.log(`[e2e] createSpace percobaan ${attempt} · klaim: ${await tokenClaims()}`);
        last = await evaluate(
          `window.__M.spaceSvc.createSpace('UJI Privasi Dua Akun')
             .then(function (id) { return id; })
             .catch(function (e) { return 'ERR ' + (e.code || e.message) + ' @ ' + (e.message || '-'); })`
        );
        if (typeof last === 'string' && !last.startsWith('ERR')) return last;
        await sleep(2500);
      }
      throw new Error(`createSpace gagal setelah 3x percobaan: ${last}`);
    }

    // ---------- A: buat ruang + konten ----------
    check('A: akun uji dibuat', (await enter(emailA)) === 'created');
    const spaceId = await createSpace();
    check('A: ruang belajar dibuat', typeof spaceId === 'string' && !spaceId.startsWith('ERR'), String(spaceId));

    const topicId = await evaluate(
      `window.__M.topicSvc.createTopic(${JSON.stringify(spaceId)}, { title: 'Topik Uji', level: 0, order: 0 })`
    );
    // Penanda tiap note harus unik: kalau isi note shared memakai frasa yang
    // sama dengan penanda privat, check "tidak bocor" bisa salah positif.
    // Catatan privat juga memakai tag khusus supaya rumored "tag privat partner
    // ikut terhitung" bisa dibuktikan (tag count ikut difilter).
    const notePayload = (title, visibility) =>
      JSON.stringify({
        title,
        body: `isi ${title} — ${visibility === 'private' ? 'RAHASIA-BODY' : 'BOGAH-BODY'}`,
        topicId,
        tags: visibility === 'private' ? ['uji', 'rahasia-tag'] : ['uji'],
        status: 'draft',
        visibility,
        difficulty: 'beginner'
      });
    const privNoteId = await evaluate(
      `window.__M.noteSvc.createNote(${JSON.stringify(spaceId)}, ${notePayload('RAHASIA-ALICE', 'private')})`
    );
    const sharedNoteId = await evaluate(
      `window.__M.noteSvc.createNote(${JSON.stringify(spaceId)}, ${notePayload('BAGIKAN-ALICE', 'shared')})`
    );
    check('A: note privat + note shared dibuat', !!privNoteId && !!sharedNoteId, `${privNoteId} / ${sharedNoteId}`);

    const resourcePayload = (title, visibility) =>
      JSON.stringify({
        title,
        url: 'https://example.com/uji',
        topicId,
        type: 'website',
        description: `desc ${title}`,
        estimatedMinutes: 10,
        tags: ['uji'],
        visibility,
        difficulty: 'beginner'
      });
    const privResId = await evaluate(
      `window.__M.resSvc.createResource(${JSON.stringify(spaceId)}, ${resourcePayload('RAHASIA-RES-ALICE', 'private')})`
    );
    const sharedResId = await evaluate(
      `window.__M.resSvc.createResource(${JSON.stringify(spaceId)}, ${resourcePayload('BAGIKAN-RES-ALICE', 'shared')})`
    );
    check('A: resource privat + shared dibuat', !!privResId && !!sharedResId, `${privResId} / ${sharedResId}`);

    // State/bookmark pada note privat — harus tetap tak terlihat oleh B.
    await evaluate(
      `window.__M.noteSvc.setNoteState(${JSON.stringify(spaceId)}, ${JSON.stringify(privNoteId)}, { bookmarked: true, understood: true }, 'private')`
    );

    const inviteCode = await evaluate(`window.__M.spaceSvc.generateInvite(${JSON.stringify(spaceId)})`);
    check('A: kode undangan dibuat', typeof inviteCode === 'string' && inviteCode.length >= 20, String(inviteCode).slice(0, 8));
    const uidA = await evaluate('window.__M.fb.auth.currentUser.uid');

    // ---------- B: masuk, bergabung, lalu probing ----------
    await evaluate('window.__M.authSvc.signOutCurrent()');
    check('B: akun uji dibuat', (await enter(emailB)) === 'created');
    const joined = await evaluate(
      `window.__M.spaceSvc.joinSpaceByCode(${JSON.stringify(inviteCode)})
         .then(function (id) { return id; })
         .catch(function (e) { return 'ERR ' + e.message; })`
    );
    check('B: bergabung ke ruang via kode', joined === spaceId, String(joined));

    const space = `spaces/${spaceId}`;
    const denied = (res) => res.status === 403;

    // 1) Baca dokumen privat -> ditolak rules.
    const getPrivNote = await evaluate(`window.__M.fsGet(${JSON.stringify(`${space}/notes/${privNoteId}`)})`);
    check('B: get note privat ditolak rules (403)', denied(getPrivNote), `status ${getPrivNote.status}`);
    const getPrivRes = await evaluate(`window.__M.fsGet(${JSON.stringify(`${space}/resources/${privResId}`)})`);
    check('B: get resource privat ditolak rules (403)', denied(getPrivRes), `status ${getPrivRes.status}`);

    // 2) Query polos -> ditolak (bukan disaring diam-diam).
    const bareNotes = await evaluate(`window.__M.fsList(${JSON.stringify(`${space}/notes`)})`);
    check('B: query polos notes ditolak rules (403)', denied(bareNotes), `status ${bareNotes.status}`);
    const bareRes = await evaluate(`window.__M.fsList(${JSON.stringify(`${space}/resources`)})`);
    check('B: query polos resources ditolak rules (403)', denied(bareRes), `status ${bareRes.status}`);

    // 3) State A pada note privat tidak boleh bocor.
    const privState = await evaluate(
      `window.__M.fsGet(${JSON.stringify(`${space}/noteStates/${privNoteId}_${uidA}`)})`
    );
    check('B: baca state A di note privat ditolak (403)', denied(privState), `status ${privState.status}`);

    // 4) Query ganda (meniru useNotes/useResources) -> hanya shared.
    const dualNotes = await dualQuery('notes', 'ownerId', true);
    check(
      'B: query ganda notes → shared terbaca, privat tidak',
      Array.isArray(dualNotes?.shared)
        && dualNotes.shared.includes(sharedNoteId)
        && !dualNotes.shared.includes(privNoteId)
        && dualNotes.own.length === 0,
      JSON.stringify(dualNotes)
    );
    const dualRes = await dualQuery('resources', 'addedBy', false);
    check(
      'B: query ganda resources → shared terbaca, privat tidak',
      Array.isArray(dualRes?.shared)
        && dualRes.shared.includes(sharedResId)
        && !dualRes.shared.includes(privResId)
        && dualRes.own.length === 0,
      JSON.stringify(dualRes)
    );

    // 5) B mencoba menimpa note privat A -> ditolak.
    const forge = await evaluate(
      `window.__M.fsPatch(${JSON.stringify(`${space}/notes/${privNoteId}`)}, { title: { stringValue: 'DIBOBOL' } })`
    );
    check('B: ubah note privat A ditolak rules (403)', denied(forge), `status ${forge.status}`);

    // ---------- UI nyata untuk B ----------
    await openApp('/learn?tab=notes');
    const learnNotesB = await waitForText('BAGIKAN-ALICE');
    check('UI B /learn (notes): note shared tampil', learnNotesB.includes('BAGIKAN-ALICE'));
    // Detail check UI harus satu baris + potongan sekitar string yang dicari.
    const snippet = (text, needle, span = 140) => {
      const i = (text || '').indexOf(needle);
      const flat = (s) => (s || '').replace(/\s+/g, ' ').trim();
      if (i < 0) return '';
      return flat(text.slice(Math.max(0, i - span), i + span));
    };
    const flat = (text) => (text || '').replace(/\s+/g, ' ').trim().slice(0, 220);

    check(
      'UI B /learn (notes): note privat A tidak bocor',
      !learnNotesB.includes('RAHASIA-ALICE') && !learnNotesB.includes('RAHASIA-BODY'),
      snippet(learnNotesB, 'RAHASIA-ALICE') || snippet(learnNotesB, 'RAHASIA-BODY') || flat(learnNotesB)
    );

    await openApp('/learn?tab=resources');
    const learnResB = await waitForText('BAGIKAN-RES-ALICE');
    check('UI B /learn (resources): resource shared tampil', learnResB.includes('BAGIKAN-RES-ALICE'));
    check('UI B /learn (resources): resource privat A tidak bocor', !learnResB.includes('RAHASIA-RES-ALICE'));

    await openApp(`/notes/${privNoteId}`);
    const privPage = await waitForText('Catatan tidak ditemukan', 10000);
    check(
      'UI B /notes/:id note privat → "tidak ditemukan"',
      privPage.includes('Catatan tidak ditemukan') && !privPage.includes('RAHASIA-BODY')
    );

    // ---------- Privasi pencarian global (CP2.7) ----------
    // Dialog cari tidak boleh menjadi jalur bocor kedua: note privat A tidak
    // boleh muncul sebagai hasil, dan tag privat A tidak boleh jadi chip.
    const searchOpenB = await openSearch();
    check('UI B: dialog "Cari di ruang" terbuka', searchOpenB);

    await typeSearch('RAHASIA-ALICE');
    const searchPrivB = await waitDialog(
      (t) => t.includes('Tidak ada yang cocok') || t.includes('RAHASIA-ALICE')
    );
    check(
      'UI B: cari judul note privat A → tidak ada hasil & tidak bocor',
      searchPrivB.includes('Tidak ada yang cocok dengan pencarian ini.')
        && !searchPrivB.includes('RAHASIA-ALICE')
        && !searchPrivB.includes('RAHASIA-BODY'),
      snippet(searchPrivB, 'RAHASIA-ALICE') || flat(searchPrivB)
    );

    await typeSearch('BAGIKAN-ALICE');
    const searchSharedB = await waitDialog((t) => t.includes('BAGIKAN-ALICE'));
    check(
      'UI B: cari judul note shared A → muncul',
      searchSharedB.includes('BAGIKAN-ALICE') && !searchSharedB.includes('RAHASIA-ALICE')
    );
    check(
      'UI B: hasil pencarian menampilkan path topik',
      searchSharedB.includes('Topik Uji'),
      flat(searchSharedB.slice(searchSharedB.indexOf('BAGIKAN-ALICE')))
    );
    check(
      'UI B: tag privat A tidak muncul sebagai chip',
      /#uji/i.test(searchSharedB) && !/rahasia-tag/i.test(searchSharedB),
      flat(searchSharedB.slice(searchSharedB.search(/tag/i)))
    );

    // Filter tag: tag yang dipakai A di note privatnya tidak boleh resurrect
    // note privat tersebut.
    await typeSearch('');
    await sleep(600);
    const tagClicked = await clickTag('uji');
    const tagFiltered = await waitDialog((t) => /#uji/i.test(t));
    check(
      'UI B: filter tag tidak menampilkan materi privat A',
      tagClicked
        && tagFiltered.includes('BAGIKAN-ALICE')
        && !tagFiltered.includes('RAHASIA-ALICE')
        && !/rahasia-tag/i.test(tagFiltered),
      tagClicked ? snippet(tagFiltered, 'RAHASIA-ALICE') : 'chip tag #uji tidak ditemukan'
    );
    await closeSearch();
    await sleep(400);

    // ---------- UI & alur owner untuk A ----------
    await openApp('/');
    await evaluate('window.__M.authSvc.signOutCurrent()');
    await enter(emailA);
    await waitFirestore(`users/${uidA}`);

    // Login ulang harus mempertahankan tautan profil -> ruang.
    const profA = await evaluate(`window.__M.fsDocData(${JSON.stringify(`users/${uidA}`)})`);
    const spaceA = await evaluate(`window.__M.fsDocData(${JSON.stringify(`spaces/${spaceId}`)})`);
    check(
      'A: tautan profil -> ruang utuh setelah login ulang',
      profA?.data?.spaceId === spaceId
        && spaceA?.exists === true
        && Array.isArray(spaceA?.data?.memberIds)
        && spaceA.data.memberIds.includes(uidA)
        && spaceA.data.memberIds.length === 2,
      `profile.spaceId=${profA?.data?.spaceId} ruang.ada=${spaceA?.exists} memberIds=${JSON.stringify(spaceA?.data?.memberIds)}`
    );

    await openApp('/learn?tab=notes');
    const learnNotesA = await waitForText('RAHASIA-ALICE');

    // Data layer: dua query (shared + milik sendiri) harus mengembalikan
    // note shared DAN note privat milik A.
    const dualA = await dualQuery('notes', 'ownerId', true);
    check(
      'A: query ganda note (shared + milik sendiri) utuh',
      dualA?.shared?.includes(sharedNoteId) && dualA?.own?.includes(privNoteId),
      JSON.stringify(dualA)
    );
    check(
      'UI A /learn: note privat sendiri tetap tampil',
      learnNotesA.includes('RAHASIA-ALICE') && learnNotesA.includes('BAGIKAN-ALICE'),
      `url=${await evaluate('location.pathname + location.search')} ekor="${flat(
        (learnNotesA || '').slice(-260)
      )}"`
    );

    // Integritas data: field visibility harus benar-benar tersimpan.
    const privDoc = await evaluate(
      `window.__M.fsDocData(${JSON.stringify(`${space}/notes/${privNoteId}`)})`
    );
    const sharedDoc = await evaluate(
      `window.__M.fsDocData(${JSON.stringify(`${space}/notes/${sharedNoteId}`)})`
    );
    check(
      'A: field visibility note tersimpan benar (private/shared)',
      privDoc?.data?.visibility === 'private' && sharedDoc?.data?.visibility === 'shared',
      `privat=${privDoc?.data?.visibility} shared=${sharedDoc?.data?.visibility} fields=${JSON.stringify(Object.keys(privDoc?.data || {}))}`
    );
    const privResDoc = await evaluate(
      `window.__M.fsDocData(${JSON.stringify(`${space}/resources/${privResId}`)})`
    );
    const sharedResDoc = await evaluate(
      `window.__M.fsDocData(${JSON.stringify(`${space}/resources/${sharedResId}`)})`
    );
    check(
      'A: field visibility resource tersimpan benar (private/shared)',
      privResDoc?.data?.visibility === 'private' && sharedResDoc?.data?.visibility === 'shared',
      `privat=${privResDoc?.data?.visibility} shared=${sharedResDoc?.data?.visibility}`
    );

    // Soft-delete note shared -> hilang dari daftar aktif A, masuk Sampah.
    const del = await evaluate(
      `window.__M.noteSvc.softDeleteNote(${JSON.stringify(spaceId)}, ${JSON.stringify(sharedNoteId)})
         .then(function () { return 'ok'; })
         .catch(function (e) { return 'ERR ' + e.message; })`
    );
    await sleep(1200);
    const afterDelete = await bodyText();
    check('A: soft-delete note shared → hilang dari daftar aktif', del === 'ok' && !afterDelete.includes('BAGIKAN-ALICE'));

    const trashOpened = await clickButton('/sampah/i');
    const trashText = trashOpened ? await waitForText('BAGIKAN-ALICE', 8000) : '';
    check('A: tab Sampah menampilkan note terhapus', !!trashText.includes('BAGIKAN-ALICE'), trashOpened ? '' : 'tombol Sampah tidak ditemukan');

    const restored = await evaluate(
      `window.__M.noteSvc.restoreNote(${JSON.stringify(spaceId)}, ${JSON.stringify(sharedNoteId)})
         .then(function () { return 'ok'; })
         .catch(function (e) { return 'ERR ' + e.message; })`
    );
    await openApp('/learn?tab=notes');
    const afterRestore = await waitForText('BAGIKAN-ALICE');
    check('A: pulihkan note → tampil lagi', restored === 'ok' && afterRestore.includes('BAGIKAN-ALICE'));

    // Pencarian global untuk owner: materi privat sendiri tetap bisa dicari
    // dan tag privat sendiri boleh jadi chip (bukan kebocoran).
    const searchOpenA = await openSearch();
    await typeSearch('RAHASIA-ALICE');
    const searchOwnA = searchOpenA
      ? await waitDialog((t) => t.includes('RAHASIA-ALICE'))
      : '';
    check(
      'UI A: cari judul note privat sendiri → muncul',
      searchOwnA.includes('RAHASIA-ALICE'),
      searchOpenA ? '' : 'dialog cari tidak terbuka'
    );
    check(
      'UI A: tag privat sendiri ikut jadi chip',
      /#uji/i.test(searchOwnA) && /#rahasia-tag/i.test(searchOwnA),
      searchOpenA ? flat(searchOwnA.slice(searchOwnA.search(/tag/i))) : 'dialog cari tidak terbuka'
    );
    await closeSearch();
    await sleep(300);

    // ---------- Error konsol ----------
    const pageErrors = (await evaluate('window.__M.errors.slice(0, 10)')) || [];
    const realErrors = pageErrors.filter((m) => !/favicon|React DevTools|ResizeObserver/i.test(m));
    check('Tidak ada error konsol selama skenario', realErrors.length === 0, realErrors.join(' | '));
  } finally {
    try {
      cdp?.ws.close();
    } catch {
      /* abaikan */
    }
    try {
      proc.kill();
    } catch {
      /* abaikan */
    }
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
    try {
      await cleanupTestData({ apply: true });
    } catch (err) {
      console.log(`[e2e] cleanup gagal: ${err.message}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== E2E PRIVASI: ${results.length - failed.length}/${results.length} lulus ===`);
  for (const f of failed) console.log(`  GAGAL: ${f.name}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\n[e2e] ERROR FATAL:', err.message);
  process.exit(1);
});
