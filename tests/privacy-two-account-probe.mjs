// Probe privasi Notes/Resources dengan DUA AKUN NYATA di browser sungguhan.
//
// Tujuannya membuktikan apa yang sebenarnya terjadi di Rules saat ini — bukan
// mengandalkan laporan lama. Yang diuji LANGSUNG lewat SDK Firestore (bukan
// melalui UI), karena itu jalur yang tidak bisa ditutup oleh penyaringan UI.
//
// Skenario: A membuat note & resource PRIVATE, lalu B mencoba membacanya
// langsung dari console. Hasil yang meyakinkan: getDoc private DITOLAK
// (permission-denied), sementara note shared tetap boleh dibaca.

import { connect, sleep } from './helpers/cdp.mjs';

const APP = process.env.E2E_APP_URL || 'http://127.0.0.1:5173';
const PORT = Number(process.env.E2E_CDP_PORT || 9415);
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-learning-berdua';
const PASSWORD = 'UjiRahasia123!';
const RUN = String(Date.now());
// WAJIB mengikuti konvensi helpers/cleanup-test-data.mjs (pola `lbtest-*`),
// kalau tidak akun & ruang uji ini tidak akan ikut terhapus oleh `npm run
// test:cleanup` dan akan menumpuk di emulator.
const EMAIL_A = `lbtest-pv-a-${RUN}@example.test`;
const EMAIL_B = `lbtest-pv-b-${RUN}@example.test`;

const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok });
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${info ? '  -> ' + info : ''}`);
}

async function markVerified(uid) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update?key=${PROJECT}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, emailVerified: true })
  });
  if (!res.ok) throw new Error(`tandai email terverifikasi gagal: ${res.status}`);
}

// Modul app + SDK Firestore (pre-bundled Vite) dipasang ke window.
const BOOT = `
  window.__v = {};
  // Specifier telanjang 'firebase/firestore' tidak bisa di-import dari console.
  // Vite menulis SDK sebagai pre-bundled dep, jadi URL-nya (beserta hash v=)
  // dicari dari hasil transform modul lib/firebase.js.
  window.__v.fs = fetch('/src/lib/firebase.js')
    .then(function (r) { return r.text(); })
    .then(function (t) {
      var key = '/node_modules/.vite/deps/firebase_firestore.js';
      var i = t.indexOf(key);
      if (i < 0) return import(key);
      var tail = t.slice(i + key.length).match(/^[?]v=[0-9a-zA-Z_-]+/);
      return import(tail ? key + tail[0] : key);
    });
  window.__v.boot = Promise.all([
    window.__v.fs,
    import('/src/lib/firebase.js'),
    import('/src/features/auth/services/authService.js'),
    import('/src/features/space/services/spaceService.js'),
    import('/src/features/notes/services/noteService.js'),
    import('/src/features/resources/services/resourceService.js'),
    import('/src/features/topics/services/topicService.js')
  ]).then(function (m) {
    window.__v.sdk = m[0]; window.__v.fb = m[1]; window.__v.authSvc = m[2];
    window.__v.spaceSvc = m[3]; window.__v.noteSvc = m[4];
    window.__v.resSvc = m[5]; window.__v.topicSvc = m[6];
    return true;
  });
  true;
`;

// Masuk (atau daftar) sebagai akun uji lalu pastikan profil + token siap.
const enter = (email) => `window.__v.boot.then(function () {
  return window.__v.authSvc.signUp(${JSON.stringify(email)}, ${JSON.stringify(PASSWORD)}, 'Uji Privasi')
    .then(function () { return 'created'; })
    .catch(function (e) {
      if (e.code !== 'auth/email-already-in-use') return 'ERR ' + e.code;
      return window.__v.authSvc.signIn(${JSON.stringify(email)}, ${JSON.stringify(PASSWORD)})
        .then(function () { return 'signed-in'; })
        .catch(function (e2) { return 'ERR ' + e2.code; });
    });
})`;


// A: buat ruang sendiri (butuh klaim email_verified), topsik, lalu private+shared.
const A_SCENARIO = `window.__v.boot.then(function () {
  var v = window.__v, sdk = v.sdk, fb = v.fb;
  return (async function () {
    var uid = fb.auth.currentUser.uid;
    await v.authSvc.ensureProfile(uid);
    await fb.auth.currentUser.getIdToken(true);
    var spaceId = await v.spaceSvc.createSpace('UJI Privasi Dua Akun');
    // Semua service create* mengembalikan ID berupa string, bukan objek.
    var topicId = await v.topicSvc.createTopic(spaceId, { title: 'Topik Uji', level: 0, order: 0 });
    var base = { topicId: topicId, tags: [], description: '', status: 'draft', difficulty: 'beginner' };
    var privNote = await v.noteSvc.createNote(spaceId, Object.assign({}, base, {
      title: 'RAHASIA-NOTE', body: 'RAHASIA-NOTE-12345', visibility: 'private' }));
    var sharedNote = await v.noteSvc.createNote(spaceId, Object.assign({}, base, {
      title: 'PUBLIK-NOTE', body: 'PUBLIK-NOTE-67890', visibility: 'shared' }));
    var privRes = await v.resSvc.createResource(spaceId, {
      title: 'RAHASIA-RES', url: 'https://example.com/rahasia', topicId: topicId, type: 'pdf',
      author: '', tags: [], description: '', difficulty: 'beginner', visibility: 'private' });
    var code = await v.spaceSvc.generateInvite(spaceId);
    return { spaceId: spaceId, code: code,
             ids: { privNote: privNote, sharedNote: sharedNote, privRes: privRes } };
  })();
})`;

// B: gabung lewat kode, lalu mencoba membaca data privat A LANGSUNG via SDK.
const B_SCENARIO = (setup) => `window.__v.boot.then(function () {
  var v = window.__v, sdk = v.sdk, fb = v.fb;
  var ctx = ${JSON.stringify(setup)};
  return (async function () {
    await v.authSvc.ensureProfile(fb.auth.currentUser.uid);
    var spaceId = await v.spaceSvc.joinSpaceByCode(ctx.code);
    var out = { uid: fb.auth.currentUser.uid, spaceId: spaceId, sameSpace: spaceId === ctx.spaceId };
    var grab = async function (col, id) {
      try {
        var s = await sdk.getDoc(sdk.doc(fb.db, 'spaces', spaceId, col, id));
        return s.exists() ? { ok: true } : { ok: false, err: 'not-found' };
      } catch (e) { return { ok: false, err: (e && e.code) || String(e) }; }
    };
    out.privNote = await grab('notes', ctx.ids.privNote);
    out.sharedNote = await grab('notes', ctx.ids.sharedNote);
    out.privRes = await grab('resources', ctx.ids.privRes);
    // Query polos tanpa where -> harus DITOLAK seluruhnya, bukan disaring.
    var bare = async function (col) {
      try {
        var s = await sdk.getDocs(sdk.collection(fb.db, 'spaces', spaceId, col));
        return { ok: true, n: s.size };
      } catch (e) { return { ok: false, err: (e && e.code) || String(e) }; }
    };
    out.bareNotes = await bare('notes');
    out.bareRes = await bare('resources');
    // Dual-listener: pola yang benar-benar dipakai useNotes di aplikasi.
    var sharedQ = sdk.query(sdk.collection(fb.db, 'spaces', spaceId, 'notes'),
      sdk.where('visibility', '==', 'shared'), sdk.where('deletedAt', '==', null));
    var ownQ = sdk.query(sdk.collection(fb.db, 'spaces', spaceId, 'notes'),
      sdk.where('ownerId', '==', fb.auth.currentUser.uid));
    var both = await Promise.all([sdk.getDocs(sharedQ), sdk.getDocs(ownQ)]);
    out.dualTitles = Array.prototype.concat
      .call(Array.from(both[0].docs), Array.from(both[1].docs))
      .map(function (d) { return d.data().title; });
    return out;
})`;

async function main() {
  const cdp = await connect(PORT);
  try {
    await cdp.viewport(1280, 900);
    await cdp.go(`${APP}/login`);
    await cdp.ev(BOOT);
    console.log(`\n[e2e] akun uji: ${EMAIL_A} / ${EMAIL_B}\n`);

    // ---------- A: daftar, verifikasi, buat ruang + konten privat ----------
    const enterA = await cdp.ev(enter(EMAIL_A), true);
    check('A: akun uji dibuat', enterA === 'created' || enterA === 'signed-in', String(enterA));
    const uidA = await cdp.ev(`window.__v.fb.auth.currentUser.uid`);
    if (enterA === 'created') await markVerified(uidA);
    await cdp.ev(`window.__v.authSvc.ensureProfile(${JSON.stringify(uidA)}); true`);
    await sleep(1200);

    // createSpace menuntut klaim email_verified; emulator kadang butuh
    // beberapa detik sampai klaim itu masuk ke ID token (pola harness cp23).
    let setup = null;
    let last = 'tidak ada percobaan';
    for (let attempt = 1; attempt <= 3 && !setup; attempt += 1) {
      await markVerified(uidA);
      await cdp.ev(`window.__v.fb.auth.currentUser.getIdToken(true).then(function(){ return true; })`, true);
      last = await cdp.ev(A_SCENARIO, true);
      if (last && !String(last).startsWith('ERR')) setup = last;
      else {
        console.log(`  percobaan ${attempt} gagal: ${String(last).slice(0, 90)}`);
        await sleep(2000);
      }
    }
    check('A: ruang belajar dibuat', !!setup, String(last).slice(0, 90));
    if (!setup) throw new Error(`createSpace gagal: ${String(last).slice(0, 120)}`);
    console.log(`  ruang=${setup.spaceId}  notePrivat=${setup.ids.privNote}\n`);

    // ---------- B: daftar, verifikasi, gabung lewat kode ----------
    await cdp.ev(`window.__v.authSvc.signOutCurrent().then(function(){ return true; })`, true);
    const enterB = await cdp.ev(enter(EMAIL_B), true);
    check('B: akun uji dibuat', enterB === 'created' || enterB === 'signed-in', String(enterB));
    const uidB = await cdp.ev(`window.__v.fb.auth.currentUser.uid`);
    // Tandai terverifikasi LALU refresh token: rule `invites` membaca klaim
    // email_verified dari ID token, bukan dari dokumen profil.
    if (enterB === 'created') await markVerified(uidB);
    await sleep(800);
    await cdp.ev(`window.__v.fb.auth.currentUser.getIdToken(true).then(function(){ return true; })`, true);
    await cdp.ev(`window.__v.authSvc.ensureProfile(${JSON.stringify(uidB)}); true`);
    await sleep(1200);
    check('B: akun berbeda dari A', !!uidB && uidB !== uidA, `B=${uidB}`);

    const probe = await cdp.ev(
      `window.__v.boot.then(function () {
         var v = window.__v, sdk = v.sdk, fb = v.fb;
         var ctx = ${JSON.stringify({
           spaceId: setup.spaceId,
           code: setup.code,
           ids: setup.ids
         })};
         return (async function () {
           await v.authSvc.ensureProfile(fb.auth.currentUser.uid);
           var spaceId = await v.spaceSvc.joinSpaceByCode(ctx.code);
           var out = { uid: fb.auth.currentUser.uid, spaceId: spaceId, sameSpace: spaceId === ctx.spaceId };
           var grab = async function (col, id) {
             try {
               var s = await sdk.getDoc(sdk.doc(fb.db, 'spaces', spaceId, col, id));
               return s.exists() ? { ok: true } : { ok: false, err: 'not-found' };
             } catch (e) { return { ok: false, err: (e && e.code) || String(e) }; }
           };
           out.privNote = await grab('notes', ctx.ids.privNote);
           out.sharedNote = await grab('notes', ctx.ids.sharedNote);
           out.privRes = await grab('resources', ctx.ids.privRes);
           var bare = async function (col) {
             try {
               var s = await sdk.getDocs(sdk.collection(fb.db, 'spaces', spaceId, col));
               return { ok: true, n: s.size };
             } catch (e) { return { ok: false, err: (e && e.code) || String(e) }; }
           };
           out.bareNotes = await bare('notes');
           out.bareRes = await bare('resources');
           var sharedQ = sdk.query(sdk.collection(fb.db, 'spaces', spaceId, 'notes'),
             sdk.where('visibility', '==', 'shared'), sdk.where('deletedAt', '==', null));
           var ownQ = sdk.query(sdk.collection(fb.db, 'spaces', spaceId, 'notes'),
             sdk.where('ownerId', '==', fb.auth.currentUser.uid));
           var both = await Promise.all([sdk.getDocs(sharedQ), sdk.getDocs(ownQ)]);
           out.dualTitles = Array.prototype.concat
             .call(Array.from(both[0].docs), Array.from(both[1].docs))
             .map(function (d) { return d.data().title; });
           return out;
         })();
       })`,
      true
    );
    check('B: bergabung ke ruang yang sama dengan A', probe?.sameSpace === true, `spaceId=${probe?.spaceId}`);

    // Inti checkpoint: partner tidak boleh bisa membaca data private.
    // `err` WAJIB permission-denied — kalau err lain (mis. TypeError) itu bug
    // harness, bukan bukti privasi, jadi tidak boleh dihitung lulus.
    const denied = (r) => r?.ok === false && r?.err === 'permission-denied';
    check('B: note PRIVATE ditolak rules (getDoc langsung)', denied(probe?.privNote),
      `err=${probe?.privNote?.err}`);
    check('B: resource PRIVATE ditolak rules (getDoc langsung)', denied(probe?.privRes),
      `err=${probe?.privRes?.err}`);
    check('B: note SHARED tetap boleh dibaca (tidak over-block)', probe?.sharedNote?.ok === true,
      `err=${probe?.sharedNote?.err}`);

    // Jalur kedua: isi private tidak boleh bocor lewat list.
    check('B: query polos notes ditolak (bukan disaring)', denied(probe?.bareNotes),
      `err=${probe?.bareNotes?.err}`);
    check('B: query polos resources ditolak (bukan disaring)', denied(probe?.bareRes),
      `err=${probe?.bareRes?.err}`);

    // Jalur ketiga: dual-listener (pola yang dipakai app) tidak boleh memunculkan private.
    const leaked = (probe?.dualTitles || []).some((t) => String(t).includes('RAHASIA'));
    check('B: dual-listener tidak memunculkan note private A', leaked === false,
      JSON.stringify(probe?.dualTitles));
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
