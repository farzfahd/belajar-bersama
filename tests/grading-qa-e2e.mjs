// Fase 2 — QA GRADING (browser sungguhan + layanan aplikasi apa adanya).
//
// Prasyarat (dua proses terpisah):
//   npx firebase emulators:start --only auth,firestore --project demo-learning-berdua
//   npm run dev
// Jalankan: node tests/grading-qa-e2e.mjs
//
// Yang diverifikasi terhadap grading yang baru diimplementasikan:
//   1. PGK (γ=0.75) kredit parsial pada halaman hasil nyata.
//   2. Menjodohkan: kredit parsial + tidak bocor kunci jawaban.
//   3. Mengurutkan: kredit parsial + "jawaban kosong TIDAK boleh menampilkan
//      answer key" (item benar / urutan benar) sebagai fallback.
//   4. Studi kasus: 0 sub-soal (perilaku terdokumentasi), auto-only, finalisasi.
//   5. Kuis campur 10 tipe end-to-end: skor, status, penilaian manual, finalisasi.
//   6. Keamanan/integritas: attempt partner tidak terbaca, nilai manual tidak
//      tertimpa, tanpa error konsol.
//   7. Visual: viewport desktop + mobile + mode gelap (screenshot).
//
// Kebersihan: akun/ruang uji dihapus lewat tests/helpers/cleanup-test-data.mjs.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanupTestData, testEmail } from './helpers/cleanup-test-data.mjs';

const APP = process.env.E2E_APP_URL || 'http://127.0.0.1:5173';
const PROJECT = 'demo-learning-berdua';
const AUTH = 'http://127.0.0.1:9099';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9334);
const PASSWORD = 'UjiRahasia123!';
const SHOTS = process.env.E2E_SHOTS || path.join(process.env.TEMP || '.', 'opencode', 'qa-shots');

const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok });
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${info ? ` -> ${info}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const PAGE_BOOT = `
(function () {
  var PROJECT = ${JSON.stringify(PROJECT)};
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
    import('/src/features/topics/services/topicService.js'),
    import('/src/features/questions/services/questionService.js'),
    import('/src/features/quizzes/services/quizService.js'),
    import('/src/features/quizzes/utils/attemptEngine.js')
  ]).then(function (m) {
    window.__M.fb = m[0];
    window.__M.authSvc = m[1];
    window.__M.spaceSvc = m[2];
    window.__M.topicSvc = m[3];
    window.__M.qSvc = m[4];
    window.__M.quizSvc = m[5];
    window.__M.engine = m[6];
    return true;
  });
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
  // Baca soal bersama + milik sendiri (pola useQuestions).
  window.__M.loadQuestions = function (spaceId) {
    return window.__M.loadFsSdk().then(function (m) {
      return import('/src/lib/firebase.js').then(function (f) {
        var c = m.collection(f.db, 'spaces', spaceId, 'questions');
        var uid = f.auth.currentUser.uid;
        return Promise.all([
          m.getDocs(m.query(c, m.where('visibility', '==', 'shared'), m.where('deletedAt', '==', null))),
          m.getDocs(m.query(c, m.where('createdBy', '==', uid)))
        ]).then(function (r) {
          var seen = new Map();
          r.forEach(function (s) { s.docs.forEach(function (d) { seen.set(d.id, { id: d.id, ...d.data() }); }); });
          return Array.from(seen.values());
        });
      });
    });
  };
  window.__M.fsGet = function (p) {
    return fetch('http://127.0.0.1:8080/v1/projects/' + PROJECT + '/databases/(default)/documents/' + p, {
      headers: { Authorization: 'Bearer ' + window.__M.token }
    }).then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t.slice(0, 200) }; }); });
  };
  window.__M.refreshToken = function () {
    if (!window.__M.fb.auth.currentUser) return Promise.resolve(null);
    return window.__M.fb.auth.currentUser.getIdToken(true);
  };
  return true;
})();
`;

async function main() {
  const chrome = findChrome();
  const profile = mkdtempSync(path.join(tmpdir(), 'grading-qa-'));
  mkdirSync(SHOTS, { recursive: true });
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

    const withTimeout = (p, ms, label) =>
      Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${label}`)), ms))
      ]);
    const evaluate = async (expression) => {
      const res = await withTimeout(raw('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), 45000, `evaluate: ${expression.slice(0, 60)}`);
      if (res.exceptionDetails) {
        const msg = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'evaluate gagal';
        throw new Error(`EVAL<<${expression.slice(0, 160)}>> -> ${msg}`);
      }
      return res.result.value;
    };
    const openApp = async (route = '/') => {
      await raw('Page.navigate', { url: APP + route });
      await sleep(400);
      await evaluate(PAGE_BOOT);
      await evaluate('window.__M.mods');
      await evaluate(
        'window.__M.refreshToken().then(function (t) { window.__M.token = t; return true; })'
      );
    };
    const fullText = () => evaluate('document.body.innerText || ""');
    const waitFor = async (predicate, timeoutMs = 15000) => {
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
    const shot = async (name) => {
      const r = await raw('Page.captureScreenshot', { format: 'png' });
      const file = path.join(SHOTS, name);
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log(`[shot] ${file}`);
    };
    const viewport = async (width, height) => {
      await raw('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      });
      await sleep(400);
    };

    await raw('Page.enable');
    await raw('Runtime.enable');
    await openApp('/');

    const runId = Date.now();
    const emailA = testEmail('qa-a', runId);
    const emailB = testEmail('qa-b', runId);
    console.log(`\n[qa] akun uji: ${emailA} / ${emailB}\n`);

    async function markVerified(uid) {
      const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update?key=${PROJECT}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: uid, emailVerified: true })
      });
      if (!res.ok) throw new Error(`tandai email terverifikasi gagal: ${res.status}`);
    }
    async function enter(email) {
      const out = await evaluate(
        `window.__M.authSvc.signUp(${JSON.stringify(email)}, ${JSON.stringify(PASSWORD)}, 'Uji QA')
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
    async function createSpace() {
      let last = 'ERR tidak ada percobaan';
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await markVerified(await evaluate('window.__M.fb.auth.currentUser.uid'));
        await evaluate('window.__M.refreshToken().then(function (t) { window.__M.token = t; return true; })');
        last = await evaluate(
          `window.__M.spaceSvc.createSpace('UJI QA Grading')
             .then(function (id) { return id; })
             .catch(function (e) { return 'ERR ' + (e.code || e.message); })`
        );
        if (typeof last === 'string' && !last.startsWith('ERR')) return last;
        await sleep(2500);
      }
      throw new Error(`createSpace gagal: ${last}`);
    }

    check('akun uji dibuat', (await enter(emailA)) === 'created');
    const spaceId = await createSpace();
    check('ruang QA dibuat', typeof spaceId === 'string' && !spaceId.startsWith('ERR'), spaceId);

    // ---------- Seed: topik + soal ----------
    const topicId = await evaluate(
      `window.__M.topicSvc.createTopic(${JSON.stringify(spaceId)}, { title: 'Topik QA', level: 0, order: 0 })`
    );
    check('topik dibuat', typeof topicId === 'string', topicId);

    const mkQ = (label, payload) =>
      evaluate(
        `window.__M.qSvc.createQuestion(${JSON.stringify(spaceId)}, ${JSON.stringify({ topicId, visibility: 'shared', ...payload })})
           .then(function (realId) { return JSON.stringify({ label: ${JSON.stringify(label)}, id: realId }); })
           .catch(function (e) { return 'ERR ' + e.message; })`
      ).then((s) => {
        if (String(s).startsWith('ERR')) return s;
        const o = JSON.parse(s);
        ID_LABEL[o.label] = o.id;
        return o.id;
      });

    // Kunci label -> id AKHIR (id ditentukan service, bukan payload).
    const ID_LABEL = {};
    // Daftar [id, payload] yang dibuat; id dikembalikan service.
    const seedDefs = [
      ['single', { prompt: 'Soal tunggal: pilih C.', type: 'single', points: 10, options: ['A', 'B', 'C', 'D'], answerIndex: 2 }],
      ['pgk', { prompt: 'PGK: pilih A, C, D.', type: 'multiple', points: 10, options: ['A', 'B', 'C', 'D', 'E'], correctIndices: [0, 2, 3] }],
      ['matching', { prompt: 'Menjodohkan: sebut hewan.', type: 'matching', points: 10, pairs: [{ left: 'Kucing', right: 'Meong' }, { left: 'Anjing', right: 'Guk' }, { left: 'Bebek', right: 'Kwek' }, { left: 'Sapi', right: 'Moo' }] }],
      ['ordering', { prompt: 'Urutkan rutinitas harian.', type: 'ordering', points: 10, items: ['Bangun', 'Makan', 'Bekerja', 'Tidur'] }],
      ['numerical', { prompt: 'Berapa 40+2?', type: 'numerical', points: 10, correctValue: 42, tolerance: 0 }],
      ['short', { prompt: 'Ibu kota Indonesia?', type: 'short_answer', points: 10, acceptedAnswers: ['jakarta'] }],
      ['boolean', { prompt: 'Bumi itu datar.', type: 'boolean', points: 10, correctBoolean: false }],
      ['case', { prompt: 'Kasus: sebuah taman.', type: 'case_study', points: 10, caseText: 'Tiga kucing duduk di taman.', subQuestions: [{ type: 'single', prompt: 'Berapa ekor kucing?', options: ['Tiga', 'Empat'], answerIndex: 0 }, { type: 'numerical', prompt: '3+4', correctValue: 7, tolerance: 0 }] }],
      ['essay', { prompt: 'Jelaskan konsep gravitasi.', type: 'essay', points: 10, sampleAnswer: 'percepatan' }],
      ['code', { prompt: 'Tulis fungsi tambah.', type: 'code', points: 10, starterCode: '// isi', expectedOutput: '2', sampleSolution: 'function' }],
      ['ordering-empty', { prompt: 'Jangan sentuh apa pun di soal ini.', type: 'ordering', points: 10, items: ['Alfa', 'Beta', 'Gamma', 'Delta'] }],
      ['matching-empty', { prompt: 'Pasangkan setidaknya satu.', type: 'matching', points: 10, pairs: [{ left: 'Satu', right: 'One' }, { left: 'Dua', right: 'Two' }, { left: 'Tiga', right: 'Three' }] }],
      ['case0', { prompt: 'Kasus tanpa sub-soal.', type: 'case_study', points: 10, caseText: 'Studi kasus tanpa pertanyaan.' }]
    ];
    for (const [label, payload] of seedDefs) {
      await mkQ(label, payload);
    }
    check('13 soal dibuat', Object.values(ID_LABEL).length === 13 && Object.values(ID_LABEL).every((id) => id && !String(id).startsWith('ERR')), Object.values(ID_LABEL).filter((x) => String(x).startsWith('ERR')).join(',') || `${Object.values(ID_LABEL).length} id`);

    const makeQuiz = (label, idList, settings) =>
      evaluate(
        `window.__M.quizSvc.createQuiz(${JSON.stringify(spaceId)}, ${JSON.stringify({
          title: label, description: 'deskripsi', topicId, questionIds: idList, settings
        })})
         .then(function (id) { return id; })
         .catch(function (e) { return 'ERR ' + e.message; })`
      );
    const s = { randomizeQuestionOrder: false, randomizeOptionOrder: false, timeLimitMinutes: 0, passingScorePercent: 70, maxAttempts: 3, showAnswerMode: 'after_all', showExplanation: true, allowRetry: true };
    const mixedQuizId = await makeQuiz('Kuis Campur 10 Tipe', ['single', 'pgk', 'matching', 'ordering', 'numerical', 'short', 'boolean', 'case', 'essay', 'code'].map((l) => ID_LABEL[l]), s);
    const leakQuizId = await makeQuiz('Kuis Bocor-Uji', [ID_LABEL['ordering-empty'], ID_LABEL['matching-empty']], s);
    const case0QuizId = await makeQuiz('Kuis Case 0 Sub', [ID_LABEL.case0], s);
    check('3 kuis dibuat', [mixedQuizId, leakQuizId, case0QuizId].every((x) => x && !String(x).startsWith('ERR')), `${mixedQuizId}/${leakQuizId}/${case0QuizId}`);

    // ---------- B bergabung & membaca kuis ----------
    // Undangan dibuat oleh A (anggota) SELAGI A masih masuk.
    const inviteCode = await evaluate(`window.__M.spaceSvc.generateInvite(${JSON.stringify(spaceId)}).catch(function(e){return 'ERR '+e.message;})`);
    check('A membuat kode undangan', typeof inviteCode === 'string' && !String(inviteCode).startsWith('ERR'), String(inviteCode).slice(0, 10));
    await evaluate('window.__M.authSvc.signOutCurrent()');
    await enter(emailB);
    const joined = await evaluate(
      `window.__M.spaceSvc.joinSpaceByCode(${JSON.stringify(inviteCode)})
         .then(function (id) { return id; })
         .catch(function (e) { return 'ERR ' + e.message; })`
    );
    check('B bergabung via kode', joined === spaceId, String(joined));
    const bQuizzes = await evaluate(`window.__M.quizSvc.getQuizzes(${JSON.stringify(spaceId)}).catch(function(e){return 'ERR '+e.message;})`);
    check('B (anggota) baca daftar kuis', Array.isArray(bQuizzes) && bQuizzes.length === 3, Array.isArray(bQuizzes) ? `${bQuizzes.length} kuis` : bQuizzes);

    // helper: ambil attempt lalu submit lewat service (attempt perlu doc asli).
    const runAttempt = async (quizId, idLabelAnswers) => {
      const quiz = await evaluate(`window.__M.quizSvc.getQuiz(${JSON.stringify(spaceId)}, ${JSON.stringify(quizId)})`).catch((e) => { throw new Error('[getQuiz] ' + e.message); });
      const qs = await evaluate(`window.__M.loadQuestions(${JSON.stringify(spaceId)})`).catch((e) => { throw new Error('[loadQuestions] ' + e.message); });
      const attemptId = await evaluate(
        `window.__M.quizSvc.startAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(quizId)}, ${JSON.stringify(quiz)}, ${JSON.stringify(qs)})
           .then(function (id) { return id; })
           .catch(function (e) { return 'ERR ' + e.message; })`
      ).catch((e) => { throw new Error('[startAttempt] ' + e.message); });
      if (String(attemptId).startsWith('ERR')) return { error: attemptId };
      const result = await evaluate(
        `(function () {
           return window.__M.quizSvc.getAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(quizId)}, ${JSON.stringify(attemptId)})
             .then(function (attempt) {
               var graded = window.__M.engine.buildAnswers(attempt.questionSnapshot, ${JSON.stringify(idLabelAnswers)});
               return window.__M.quizSvc.submitAttempt(
                 ${JSON.stringify(spaceId)}, ${JSON.stringify(quizId)}, ${JSON.stringify(attemptId)},
                 graded, attempt, 70, null, 300
               ).then(function (r) { return JSON.stringify(r); }).catch(function (e) { return 'ERR ' + e.message; });
             });
         })()`
      );
      if (String(result).startsWith('ERR')) return { error: result, attemptId };
      const attempt = JSON.parse(
        await evaluate(`(async () => JSON.stringify(await window.__M.quizSvc.getAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(quizId)}, ${JSON.stringify(attemptId)})))()`)
      );
      return { attemptId, attempt, quiz, quizId };
    };

    // ===================================================================
    // 1) KUIS CAMPUR — B end-to-end
    // ===================================================================
    const qid = (label) => ID_LABEL[label];
    const mixedAnswers = {
      [qid('single')]: 2,
      [qid('pgk')]: [0, 2],
      [qid('matching')]: { Kucing: 'Meong', Anjing: 'Guk', Bebek: 'Kwek', Sapi: 'Meong' },
      [qid('ordering')]: ['Bangun', 'Makan', 'Tidur', 'Bekerja'],
      [qid('numerical')]: 42,
      [qid('short')]: 'jakarta',
      [qid('boolean')]: true,
      [qid('case')]: { 0: 0, 1: 7 },
      [qid('essay')]: 'gaya tarik',
      [qid('code')]: 'function add(a,b){return a+b}'
    };
    const mixed = await runAttempt(mixedQuizId, mixedAnswers);
    check('B memulai & submit kuis campur', !mixed.error, mixed.error || mixed.attemptId);
    const ma = mixed.attempt;
    check('skor auto 59.17', ma.score === 59.17, String(ma.score));
    check('maxScore 100', ma.maxScore === 100, String(ma.maxScore));
    check('scorePercent 59.2', ma.scorePercent === 59.2, String(ma.scorePercent));
    check('status pending_manual_grade', ma.status === 'pending_manual_grade', ma.status);
    check('passed=false (59.2<70)', ma.passed === false, String(ma.passed));
    const entry = (label) => ma.answers.find((a) => a.questionId === ID_LABEL[label]);
    check('PGK A,C -> 6.67 & tidak "benar"', entry('pgk').pointsEarned === 6.67 && entry('pgk').isCorrect === false, JSON.stringify(entry('pgk')));
    check('matching 3/4 -> 7.5', entry('matching').pointsEarned === 7.5, String(entry('matching').pointsEarned));
    check('ordering 2/4 -> 5', entry('ordering').pointsEarned === 5, String(entry('ordering').pointsEarned));
    check('case auto-only -> 10, non-manual', entry('case').pointsEarned === 10 && entry('case').needsManualGrade === false, JSON.stringify(entry('case')));
    check('single benar -> 10', entry('single').pointsEarned === 10 && entry('single').isCorrect === true);
    check('numerical benar -> 10', entry('numerical').pointsEarned === 10);
    check('short benar -> 10', entry('short').pointsEarned === 10);
    check('boolean salah -> 0', entry('boolean').pointsEarned === 0);
    check('essay & code -> manual menunggu', entry('essay').needsManualGrade && entry('code').needsManualGrade && entry('essay').manualScore === null);

    // ---------- Halaman hasil (UI nyata) ----------
    await evaluate(`window.__M.refreshToken().then(function (t) { window.__M.token = t; return true; })`);
    await openApp(`/quiz/${mixedQuizId}/attempt/${mixed.attemptId}/result`);
    const resultText = await waitFor((t) => t.includes('Kuis Campur 10 Tipe') && t.includes('/ 100 poin'));
    check('halaman hasil tampil', resultText.includes('Kuis Campur 10 Tipe'));
    check('header: 59.17 / 100 poin · 59.2%', resultText.includes('59.17 / 100 poin') && resultText.includes('59.2%'), (resultText.match(/\d+\.?\d* \/ \d+ poin[^%]*%/)?.[0]) || '');
    check('badge status Menunggu penilaian', resultText.toLowerCase().includes('menunggu penilaian'));
    check('kartu memakai snapshot soal', resultText.includes('Soal tunggal: pilih C.') && resultText.includes('Tiga kucing duduk'));

    const cardTexts = await evaluate(
      `(function () {
         var cards = Array.prototype.filter.call(document.querySelectorAll('main .card'), function (c) {
           return /^soal \\d/.test(((c.innerText || '').trim()).toLowerCase());
         });
         if (!cards.length) {
           return 'DIAG main=' + (!!document.querySelector('main')) + ' mainCards=' + document.querySelectorAll('.card').length + ' || ' + (document.body.innerText || '').slice(0, 300);
         }
         return cards.map(function (c) { return (c.innerText || '').replace(/\\s+/g, ' ').trim(); });
       })()`
    );
    if (typeof cardTexts === 'string') {
      console.log('[diag]', cardTexts);
      throw new Error('kartu hasil tidak ditemukan');
    }
    const cardHas = (idx, needle) => (cardTexts[idx] || '').toLowerCase().includes(needle.toLowerCase());
    const benarCount = (t) => ((t || '').match(/benar/gi) || []).length;
    check('Q1 single: Benar + 10 / 10', cardHas(0, 'Benar') && cardHas(0, '10 / 10'), (cardTexts[0] || '').slice(0, 130));
    check('Q2 PGK parsial: Salah + 6.67 / 10, tidak semua opsi jawaban bocor', cardHas(1, '6.67 / 10') && cardHas(1, 'Salah') && benarCount(cardTexts[1]) === 0, (cardTexts[1] || '').slice(0, 150));
    check('Q3 matching parsial: Salah + 7.5 / 10 + baris Sapi BELUM TEPAT tanpa pasangan kunci (Moo)', cardHas(2, '7.5 / 10') && cardHas(2, 'Salah') && cardHas(2, 'Sapi Meong Belum tepat') && !cardHas(2, 'Sapi Moo'), (cardTexts[2] || '').slice(0, 150));
    check('Q4 ordering parsial: Salah + 5 / 10 + HANYA item yang benar lokasinya berbadge Benar', cardHas(3, '5 / 10') && cardHas(3, 'Salah') && benarCount(cardTexts[3]) === 2, (cardTexts[3] || '').slice(0, 150));
    check('Q5 numerical: Benar + 10 / 10', cardHas(4, 'Benar') && cardHas(4, '10 / 10'));
    check('Q6 short: Benar + 10 / 10', cardHas(5, 'Benar') && cardHas(5, '10 / 10'));
    check('Q7 boolean: Salah + 0 / 10', cardHas(6, 'Salah') && cardHas(6, '0 / 10'));
    check('Q8 case: Benar + 10 / 10', cardHas(7, 'Benar') && cardHas(7, '10 / 10'));
    check('Q9/Q10 manual: Menunggu nilai', cardHas(8, 'Menunggu nilai') && cardHas(9, 'Menunggu nilai'));

    await viewport(1280, 900);
    await shot('mixed-result-pending-manual.png');

    // ---------- Penilaian manual ----------
    // Jalur UI: PEMILIK membuka dialog "Beri nilai" pada soal uraiannya sendiri
    // (satu-satunya cara dialog itu bisa muncul, karena attempt privat).
    const openGradeDialog = (cardIndex) =>
      evaluate(
        `(function () {
           var cards = Array.prototype.filter.call(document.querySelectorAll('main .card'), function (c) {
             return /^soal \\d/.test(((c.innerText || '').trim()).toLowerCase());
           });
           var card = cards[${cardIndex}];
           var btn = Array.prototype.find.call(card.querySelectorAll('button'), function (b) {
             return /Beri nilai/i.test(b.innerText || '');
           });
           if (!btn) return false;
           btn.click();
           return true;
         })()`
      );
    const setManual = async (value) => {
      await waitFor((t) => t.toLowerCase().includes('beri nilai manual'), 8000);
      await evaluate(
        `(function () {
           var el = document.querySelector('input[type="number"]');
           if (!el) return false;
           var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
           setter.call(el, ${JSON.stringify(String(value))});
           el.dispatchEvent(new Event('input', { bubbles: true }));
           return true;
         })()`
      );
      const clicked = await evaluate(
        `(function () {
           var btn = Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
             return /Simpan nilai/i.test(b.innerText || '');
           });
           if (!btn) return false;
           if (btn.disabled) return 'disabled';
           btn.click();
           return 'clicked';
         })()`
      );
      await sleep(900);
      return clicked;
    };
    // 1) Pemilik menilai miliknya sendiri lewat dialog → RULES MENOLAK (bug M1):
    //    `attemptOwnerUpdate` hanya mengizinkan ubah `answers` selama status
    //    `in_progress`, sedangkan dialog ini hanya muncul setelah submit.
    const ownerOpened = await openGradeDialog(8);
    if (ownerOpened) await setManual(8);
    const mAfterOwner = await evaluate(
      `window.__M.quizSvc.getAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(mixedQuizId)}, ${JSON.stringify(mixed.attemptId)})`
    ).then((a) => ({ manual: a.answers.filter((x) => x.needsManualGrade).map((x) => x.manualScore), score: a.score, status: a.status }));
    check('dialog "Beri nilai" bisa dibuka pemilik', ownerOpened === true, String(ownerOpened));
    check('BUG-M1: nilai manual OLEH PEMILIK ditolak rules (skor & nilai tidak berubah)', mAfterOwner.manual[0] === null && mAfterOwner.manual[1] === null && mAfterOwner.score === 59.17 && mAfterOwner.status === 'pending_manual_grade', JSON.stringify(mAfterOwner));

    // 2) Partner (A) menilai lewat service — jalur yang BOLEH rules (Opsi 2).
    //    Catatan: harness menangkap `answers` SELAGI masih B karena partner
    //    TIDAK BISA membaca attempt privat (rules deny GET). Di produk tidak
    //    ada salinan semacam ini, jadi partner tidak pernah sampai ke penilaian
    //    manual (lihat temuan).
    const baseline = await evaluate(
      `window.__M.quizSvc.getAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(mixedQuizId)}, ${JSON.stringify(mixed.attemptId)})`
    );
    await evaluate(`window.__M.__base = ${JSON.stringify(baseline.answers)}; true`);
    await evaluate('window.__M.authSvc.signOutCurrent()');
    await enter(emailA);
    const partnerOk = await evaluate(
      `(function () {
         var base = window.__M.__base;
         var mk = function (arr, qid, nilai) {
           return arr.map(function (x) {
             if (x.questionId !== qid) return x;
             return Object.assign({}, x, { manualScore: nilai, manualFeedback: '', gradedBy: 'A', gradedAt: new Date() });
           });
         };
         return window.__M.quizSvc.gradeAnswerManually(${JSON.stringify(spaceId)}, ${JSON.stringify(mixedQuizId)}, ${JSON.stringify(mixed.attemptId)}, base, ${JSON.stringify(ID_LABEL.essay)}, 8, '')
           .then(function () {
             return window.__M.quizSvc.gradeAnswerManually(${JSON.stringify(spaceId)}, ${JSON.stringify(mixedQuizId)}, ${JSON.stringify(mixed.attemptId)}, mk(base, ${JSON.stringify(ID_LABEL.essay)}, 8), ${JSON.stringify(ID_LABEL.code)}, 7, '');
           })
           .then(function () { return 'ok'; })
           .catch(function (e) { return 'ERR ' + (e.message || e.code); });
       })()`
    );
    check('partner (A) menilai essay 8 & code 7 (rules mengizinkan)', partnerOk === 'ok', String(partnerOk));
    await evaluate('window.__M.authSvc.signOutCurrent()');
    await enter(emailB);
    const mPartner = await evaluate(
      `window.__M.quizSvc.getAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(mixedQuizId)}, ${JSON.stringify(mixed.attemptId)})`
    ).then((a) => ({ manual: a.answers.filter((x) => x.needsManualGrade).map((x) => x.manualScore), score: a.score, status: a.status }));
    check('nilai manual partner tersimpan (8,7) tanpa mengubah field skor', JSON.stringify(mPartner.manual) === JSON.stringify([8, 7]) && mPartner.score === 59.17, JSON.stringify(mPartner));
    check('status masih pending_manual_grade', mPartner.status === 'pending_manual_grade', mPartner.status);

    // 3) Finalisasi. BUG-M2: tombol "Finalisasi skor akhir" di halaman hasil
    //    dikunci di balik `pending.length > 0 && canFinalize(answers)` — dua
    //    kondisi yang saling bertentangan (ada manual tertinggal ⇒ belum bisa
    //    finalisasi), jadi tombolnya TIDAK PERNAH dirender. Verifikasi: tombol
    //    absen walau semua manual sudah terisi, lalu finalisasi lewat service
    //    pemilik (rulenya mengizinkan; hanya jalur UI-nya yang mati).
    await evaluate(`window.__M.refreshToken().then(function (t) { window.__M.token = t; return true; })`);
    await openApp(`/quiz/${mixedQuizId}/attempt/${mixed.attemptId}/result`);
    await waitFor((t) => t.toLowerCase().includes('nilai 8') && t.toLowerCase().includes('nilai 7'), 10000);
    const finBtn = await evaluate(
      `(function () {
         var btn = Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
           return /Finalisasi skor akhir/i.test(b.innerText || '');
         });
         return btn ? ('found:' + (btn.disabled ? 'disabled' : 'enabled')) : false;
       })()`
    );
    check('BUG-M2: tombol Finalisasi skor akhir TIDAK pernah dirender (UI finalisasi mati)', finBtn === false, String(finBtn));
    const finRet = await evaluate(
      `(function () {
         return window.__M.quizSvc.getAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(mixedQuizId)}, ${JSON.stringify(mixed.attemptId)})
           .then(function (a) {
             return window.__M.quizSvc.finalizeAttempt(
               ${JSON.stringify(spaceId)}, ${JSON.stringify(mixedQuizId)}, ${JSON.stringify(mixed.attemptId)},
               a.answers, a, 70
             ).then(function (r) { return JSON.stringify(r); }).catch(function (e) { return 'ERR ' + e.message; });
           });
       })()`
    );
    check('finalisasi (service pemilik, rules mengizinkan) sukses', typeof finRet === 'string' && finRet.startsWith('{'), String(finRet));
    await sleep(800);
    const mFinalDoc = JSON.parse(await evaluate(`(async () => JSON.stringify(await window.__M.quizSvc.getAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(mixedQuizId)}, ${JSON.stringify(mixed.attemptId)})))()`));
    check('skor akhir 74.17', mFinalDoc.score === 74.17, String(mFinalDoc.score));
    check('scorePercent akhir 74.2', mFinalDoc.scorePercent === 74.2, String(mFinalDoc.scorePercent));
    check('status graded', mFinalDoc.status === 'graded', mFinalDoc.status);
    check('passed true (74.2>=70)', mFinalDoc.passed === true, String(mFinalDoc.passed));
    const manualKept = mFinalDoc.answers.filter((x) => x.needsManualGrade).map((x) => x.manualScore);
    check('nilai manual tidak tertimpa finalisasi', JSON.stringify(manualKept) === JSON.stringify([8, 7]), JSON.stringify(manualKept));

    await openApp(`/quiz/${mixedQuizId}/attempt/${mixed.attemptId}/result`);
    const finText = await waitFor((t) => t.toLowerCase().includes('dinilai'), 10000);
    const finCards = await evaluate(
      `(function () {
         var cards = Array.prototype.filter.call(document.querySelectorAll('main .card'), function (c) {
           return /^soal \\d/.test(((c.innerText || '').trim()).toLowerCase());
         });
         return cards.map(function (c) { return (c.innerText || '').replace(/\\s+/g, ' ').trim(); });
       })()`
    );
    check('hasil final: header 74.17 / 100 · 74.2%', finText.includes('74.17 / 100 poin') && (finText.includes('74.2%') || finText.includes('74.17 / 100')), (finText.match(/\d+\.?\d* \/ \d+ poin[\s\S]*?%/)?.[0]) || '');
    check('hasil final: badge Dinilai (dan Lulus)', finText.toLowerCase().includes('dinilai') && finText.toLowerCase().includes('lulus'), (finText.match(/Dinilai|Lulus/g) || []).join(','));
    check('hasil final: essay Nilai 8', (finCards[8] || '').toLowerCase().includes('nilai 8'), (finCards[8] || '').slice(0, 130));
    check('hasil final: code Nilai 7', (finCards[9] || '').toLowerCase().includes('nilai 7'), (finCards[9] || '').slice(0, 130));

    // ===================================================================
    // 2) STUDI KASUS — 0 sub-soal (perilaku terdokumentasi: kredit penuh)
    // ===================================================================
    const case0 = await runAttempt(case0QuizId, { [ID_LABEL.case0]: null });
    check('case 0 sub: attempt dibuat', !case0.error, case0.error || case0.attemptId);
    check('case 0 sub: SKOR = 10 (kredit penuh — keputusan terdokumentasi, ≠ ekspektasi "0")', case0.attempt.score === 10, String(case0.attempt.score));
    check('case 0 sub: status completed (auto, non-manual)', case0.attempt.status === 'completed', case0.attempt.status);

    // ===================================================================
    // 3) KUIS BOCOR — ordering & matching kosong (check answer-key leak)
    // ===================================================================
    // Mulai attempt B via startAttempt (jalur nyata), lalu buktikan di halaman pengerjaan.
    const leakStarted = await evaluate(
      `(function () {
         return window.__M.quizSvc.getQuiz(${JSON.stringify(spaceId)}, ${JSON.stringify(leakQuizId)})
           .then(function (quiz) {
             return window.__M.loadQuestions(${JSON.stringify(spaceId)}).then(function (qs) {
               return window.__M.quizSvc.startAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(leakQuizId)}, quiz, qs)
                 .then(function (id) { return id; })
                 .catch(function (e) { return 'ERR ' + e.message; });
             });
           });
       })()`
    );
    check('B memulai kuis bocor-uji', !String(leakStarted).startsWith('ERR'), leakStarted);

    // --- Bukti 1: halaman PENGERJAAN (in_progress) menampilkan ordering belum dijawab.
    await evaluate(`window.__M.refreshToken().then(function (t) { window.__M.token = t; return true; })`);
    await openApp(`/quiz/${leakQuizId}/attempt`);
    const attemptLeakText = await waitFor((t) => t.toLowerCase().includes('soal 1 dari') && (t.includes('Alfa') || t.includes('Jangan sentuh')), 12000);
    const ordShowsKeyDuring = ['Alfa', 'Beta', 'Gamma', 'Delta'].every((x) => attemptLeakText.includes(x));
    check('LEAK#1: pengerjaan — ordering kosong menampilkan item dlm urutan benar (answer key)', ordShowsKeyDuring, ordShowsKeyDuring ? 'Alfa..Delta tampil saat mengerjakan' : 'tidak tampil');
    await shot('ordering-attempt-empty-leak.png');

    // --- submit: ordering TIDAK dijawab, matching 1/3 benar.
    const leakSubmit = await evaluate(
      `(function () {
         return window.__M.quizSvc.getAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(leakQuizId)}, ${JSON.stringify(leakStarted)})
           .then(function (attempt) {
             var raw = {};
             attempt.questionSnapshot.forEach(function (q) {
               if (q.type === 'matching') raw[q.id] = { Satu: 'One' };
             });
             var graded = window.__M.engine.buildAnswers(attempt.questionSnapshot, raw);
             return window.__M.quizSvc.submitAttempt(
               ${JSON.stringify(spaceId)}, ${JSON.stringify(leakQuizId)}, ${JSON.stringify(leakStarted)},
               graded, attempt, 70, null, 120
             ).then(function (r) { return JSON.stringify(r); }).catch(function (e) { return 'ERR ' + e.message; });
           });
       })()`
    );
    check('B submit kuis bocor (ordering kosong)', !String(leakSubmit).startsWith('ERR'), String(leakSubmit).slice(0, 100));
    const leakAttempt = JSON.parse(
      await evaluate(`(async () => JSON.stringify(await window.__M.quizSvc.getAttempt(${JSON.stringify(spaceId)}, ${JSON.stringify(leakQuizId)}, ${JSON.stringify(leakStarted)})))()`)
    );
    const lOrder = leakAttempt.answers.find((a) => a.userAnswer === null) || {};
    check('data: skor kuis bocor 3.33 (matching 1/3; ordering 0)', leakAttempt.score === 3.33, String(leakAttempt.score));
    check('data: userAnswer ordering benar null & poin 0', lOrder.pointsEarned === 0 && lOrder.isCorrect === false, JSON.stringify(lOrder));

    // --- Bukti 2: halaman HASIL menampilkan ordering kosong sebagai jawaban benar.
    await openApp(`/quiz/${leakQuizId}/attempt/${leakStarted}/result`);
    const leakResult = await waitFor((t) => t.includes('3.33 / 20 poin'), 12000);
    const leakCards = await evaluate(
      `(function () {
         var cards = Array.prototype.filter.call(document.querySelectorAll('main .card'), function (c) {
           return /^soal \\d/.test(((c.innerText || '').trim()).toLowerCase());
         });
         return cards.map(function (c) { return (c.innerText || '').replace(/\\s+/g, ' ').trim(); });
       })()`
    );
    const orderingCard = leakCards[0] || '';
    const ordKeyShown = ['Alfa', 'Beta', 'Gamma', 'Delta'].every((x) => orderingCard.includes(x));
    const ordBenar = (orderingCard.match(/benar/gi) || []).length;
    check('LEAK#2: hasil — ordering kosong menampilkan urutan benar + 4 badge Benar', ordKeyShown && ordBenar === 4, `key=${ordKeyShown} Benar=${ordBenar}`);
    check('hasil: kartu ordering menilai 0 / 10 (kontradiksi dgn badge Benar)', orderingCard.includes('0 / 10'), orderingCard.slice(0, 130));
    const matchingCard = leakCards[1] || '';
    const mRowsLeakFree =
      matchingCard.toLowerCase().includes('satu one benar') &&
      matchingCard.toLowerCase().includes('belum tepat') &&
      !matchingCard.toLowerCase().includes('dua two') &&
      !matchingCard.toLowerCase().includes('tiga three');
    check('matching kosong: baris kosong "BELUM TEPAT", pasangan kunci (Two/Three) tidak ditampilkan sbg jawaban', mRowsLeakFree, matchingCard.slice(0, 180));
    await shot('ordering-result-empty-leak.png');

    // ===================================================================
    // 4) KEAMANAN — attempt privat
    // ===================================================================
    await evaluate('window.__M.authSvc.signOutCurrent()');
    await enter(emailA);
    const denied = await evaluate(
      `window.__M.fsGet(${JSON.stringify(`spaces/${spaceId}/quizzes/${leakQuizId}/attempts/${leakStarted}`)}).then(function (r) { return r.status; })`
    );
    check('security: A (partner) baca attempt B -> 403', denied === 403, `status ${denied}`);
    await openApp(`/quiz/${leakQuizId}/attempt/${leakStarted}/result`);
    const partnerResult = await waitFor((t) => t.includes('Attempt tidak ditemukan'), 10000);
    check('security: UI — A lihat attempt B -> "Attempt tidak ditemukan" (bukan bocor isi)', partnerResult.includes('Attempt tidak ditemukan') && !partnerResult.includes('Satu'), partnerResult.includes('Attempt tidak ditemukan') ? 'ok' : partnerResult.slice(-120));
    const aQuizzes = await evaluate(`window.__M.quizSvc.getQuizzes(${JSON.stringify(spaceId)}).catch(function (e) { return 'ERR ' + e.message; })`);
    check('security: anggota tetap baca daftar kuis', Array.isArray(aQuizzes) && aQuizzes.length === 3, Array.isArray(aQuizzes) ? `${aQuizzes.length} kuis` : aQuizzes);

    // ===================================================================
    // 5) VISUAL/UX + error konsol
    // ===================================================================
    await evaluate('window.__M.authSvc.signOutCurrent()');
    await enter(emailB);
    await evaluate(`window.__M.refreshToken().then(function (t) { window.__M.token = t; return true; })`);
    await openApp(`/quiz/${mixedQuizId}/attempt/${mixed.attemptId}/result`);
    await waitFor((t) => t.includes('Dinilai'), 10000);
    await shot('mixed-result-final-desktop-light.png');
    const themeBtn = await evaluate(
      `(function () {
         var b = Array.prototype.find.call(document.querySelectorAll('button'), function (x) {
           return /gelap/i.test((x.getAttribute('aria-label') || '') + ' ' + (x.title || ''));
         });
         if (!b) return 'none';
         b.click();
         return 'clicked';
       })()`
    );
    if (themeBtn === 'clicked') {
      await sleep(600);
      await shot('mixed-result-final-dark.png');
      check('visual: tangkapan mode gelap keluar', true);
    } else {
      console.log('[qa] tombol tema gelap tidak ditemukan — lewati tangkapan gelap');
    }
    await viewport(390, 844);
    await openApp(`/quiz/${mixedQuizId}/attempt/${mixed.attemptId}/result`);
    await waitFor((t) => t.includes('Dinilai') || t.includes('Lulus'), 10000);
    await shot('mixed-result-final-mobile.png');
    await viewport(1280, 900);
    check('visual: tangkapan mobile keluar', true);

    const pageErrors = (await evaluate('window.__M.errors.slice(0, 10)')) || [];
    const realErrors = pageErrors.filter((m) => !/favicon|React DevTools|ResizeObserver/i.test(m));
    check('TIDAK ada error konsol sepanjang skenario', realErrors.length === 0, realErrors.join(' | '));
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
      console.log(`[qa] cleanup gagal: ${err.message}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== QA GRADING: ${results.length - failed.length}/${results.length} lulus ===`);
  for (const f of failed) console.log(`  GAGAL: ${f.name}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\n[qa] ERROR FATAL:', err.message);
  process.exit(1);
});