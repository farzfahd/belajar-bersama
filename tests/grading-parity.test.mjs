// ============================================================================
// PARITAS PENILAIAN CLIENT vs SERVER (Assessment Security, PART 22/PART 26).
// ============================================================================
//
// Server WAJIB menghasilkan hasil IDENTIK dengan client untuk fixture yang sama
// (kewajiban global #7/#9: tidak boleh ada algoritma penilaian kedua). Tes ini
// membandingkan `gradeQuestionAnswer` client dengan `gradeAttemptData` server.
//
// Yang dicakup:
//   - 10 tipe soal
//   - kombinasi N/K PGK (termasuk K=N legacy yang harus tetap dinilai)
//   - gamma 0.75, matching parsial, ordering parsial, toleransi numerik
//   - studi kasus (menjumlahkan poin sub-soal)
//   - essay/code → pending manual
//   - edge case: kunci hilang, soal unavailable, jawaban null
//
// Dijalankan lewat `npm run test:units`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 1. Drift guard: satu implementasi, tiga file ----------
const SRC = join(ROOT, 'src', 'features', 'questions', 'utils', 'grading.js');
const MIRRORS = [join(ROOT, 'shared', 'grading.js'), join(ROOT, 'functions', 'src', 'shared', 'grading.js')];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

test('PARITAS: grading.js byte-identik di sumber + semua mirror', () => {
  const srcHash = sha(readFileSync(SRC));
  for (const m of MIRRORS) {
    assert.ok(existsSync(m), `${m} belum ada — jalankan: node scripts/sync-grading.mjs`);
    assert.equal(
      sha(readFileSync(m)),
      srcHash,
      `${m} berbeda dari sumber. Jangan menambal; jalankan scripts/sync-grading.mjs --force setelah menguji perubahan.`
    );
  }
});

test('PARITAS: PGK_GAMMA = 0.75 di semua salinan', async () => {
  const client = await import('../src/features/questions/utils/grading.js');
  const shared = await import('../shared/grading.js');
  const server = require('../functions/src/shared/gradeCore.js');
  assert.equal(client.PGK_GAMMA, 0.75);
  assert.equal(shared.PGK_GAMMA, 0.75);
  assert.equal(server.PGK_GAMMA ?? shared.PGK_GAMMA, 0.75);
});

test('PARITAS: sync-grading mendeteksi dan MENOLAK salinan yang dirusak', () => {
  // Guard yang tidak pernah gagal sama nilainya dengan tidak ada guard. Tes ini
  // memastikan `scripts/sync-grading.mjs` benar-benar menolak tampering DAN tidak
  // menimpa file yang rusak diam-diam.
  const mirror = join(ROOT, 'functions', 'src', 'shared', 'grading.js');
  const script = join(ROOT, 'scripts', 'sync-grading.mjs');
  const original = readFileSync(mirror, 'utf8');

  try {
    writeFileSync(mirror, `${original}\nexport const TAMPERED = true;\n`, 'utf8');
    const res = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
    assert.notEqual(res.status, 0, 'sync-grading harus keluar dengan kode bukan 0 saat ada drift');
    assert.match(
      `${res.stdout}${res.stderr}`,
      /BERBEDA|sudah ada|--force/i,
      'pesan error harus menjelaskan drift dan cara memperbaikinya'
    );
    // Yang penting: file rusak TIDAK ditimpa diam-diam.
    assert.match(
      readFileSync(mirror, 'utf8'),
      /TAMPERED/,
      'sync-grading menimpa file rusak tanpa izin — itu justru merusak jejak'
    );
  } finally {
    writeFileSync(mirror, original, 'utf8');
  }

  // Setelah dipulihkan, guard harus hijau lagi.
  const clean = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(clean.status, 0, `sync-grading gagal setelah dipulihkan: ${clean.stderr}`);
  assert.equal(
    sha(readFileSync(mirror)),
    sha(readFileSync(SRC)),
    'mirror harus identik dengan sumber setelah pemulihan'
  );
});

// ---------- 2. Muat implementasi client & server ----------
const clientGrading = await import('../src/features/questions/utils/grading.js');
const server = require('../functions/src/shared/gradeCore.js');
const { gradeQuestionAnswer, round2 } = clientGrading;

// ---------- 3. Generator fixture deterministik ----------
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildFixtures(count) {
  const rnd = lcg(20260929);
  const fixtures = [];
  const opt = (n, tag) => Array.from({ length: n }, (_, i) => `O${i}-${tag}`);

  for (let i = 0; i < count; i += 1) {
    const points = [5, 10, 20, 25, 50, 100][Math.floor(rnd() * 6)];
    const kind = i % 10;
    let question;
    let answers;

    if (kind === 0) {
      const n = 2 + Math.floor(rnd() * 6);
      const options = opt(n, 's');
      const answerIndex = Math.floor(rnd() * n);
      question = { type: 'single', options, answerIndex, points };
      answers = [Math.floor(rnd() * n), null, answerIndex, -1, 999];
    } else if (kind === 1) {
      const n = 3 + Math.floor(rnd() * 5);
      const options = opt(n, 'm');
      const K = 1 + Math.floor(rnd() * n);
      const correctIndices = Array.from({ length: K }, (_, k) => (k * 2 + 1) % n)
        .filter((v, idx, a) => a.indexOf(v) === idx)
        .slice(0, K);
      question = { type: 'multiple', options, correctIndices, points };
      const all = Array.from({ length: n }, (_, k) => k);
      answers = [
        [...correctIndices],
        [],
        all,
        [correctIndices[0]],
        Array.from({ length: n }, (_, k) => (k + 1) % n),
        [correctIndices[0], correctIndices[correctIndices.length - 1]]
      ];
    } else if (kind === 2) {
      question = { type: 'boolean', correctBoolean: rnd() > 0.5, points };
      answers = [true, false, null, 'true', 1];
    } else if (kind === 3) {
      const acceptedAnswers = [['paris'], ['  Jakarta  '], ['a', 'A', 'a'], ['x', 'y', 'z']][Math.floor(rnd() * 4)];
      question = { type: 'short_answer', acceptedAnswers, points };
      answers = [acceptedAnswers[0], '  ' + acceptedAnswers[0] + ' ', 'zzz', null, ''];
    } else if (kind === 4) {
      const size = 2 + Math.floor(rnd() * 4);
      const lefts = Array.from({ length: size }, (_, k) => `L${k}`);
      const rights = Array.from({ length: size }, (_, k) => `R${k}`);
      const usedRight = new Set();
      const pairs = lefts
        .map((l, k) => ({ left: l, right: rights[(k + Math.floor(rnd() * size)) % size] }))
        .filter((p) => {
          if (usedRight.has(p.right)) return false;
          usedRight.add(p.right);
          return true;
        });
      question = { type: 'matching', pairs, points };
      const correct = {};
      for (const p of pairs) correct[p.left] = p.right;
      const partial = { ...correct };
      if (pairs[0]) delete partial[pairs[0].left];
      answers = [correct, partial, {}, null, { zzz: 'qqq' }];
    } else if (kind === 5) {
      const size = 2 + Math.floor(rnd() * 5);
      const items = Array.from({ length: size }, (_, k) => `I${k}`);
      question = { type: 'ordering', items, points };
      const reversed = [...items].reverse();
      const half = reversed.slice(0, Math.max(1, Math.floor(size / 2)));
      answers = [items, reversed, half, null, []];
    } else if (kind === 6) {
      const correctValue = Math.floor(rnd() * 200) - 100;
      const tolerance = [0, 0.5, 1, 2.5][Math.floor(rnd() * 4)];
      question = { type: 'numerical', correctValue, tolerance, points };
      answers = [
        correctValue,
        correctValue + (tolerance || 0.01),
        correctValue + (tolerance + 1),
        '12',
        null,
        Number.NaN
      ];
    } else if (kind === 7) {
      question = { type: 'essay', sampleAnswer: 'jawaban contoh', points };
      answers = ['jawaban peserta', null];
    } else if (kind === 8) {
      question = { type: 'code', starterCode: 'x', expectedOutput: '2', sampleSolution: 'sol', points };
      answers = ['function f(){}', null];
    } else {
      const subCount = 1 + Math.floor(rnd() * 3);
      const subQuestions = [];
      const subAnswers = [];
      for (let s = 0; s < subCount; s += 1) {
        const st = ['single', 'boolean', 'numerical'][Math.floor(rnd() * 3)];
        if (st === 'single') {
          const n = 2 + Math.floor(rnd() * 3);
          const options = opt(n, `cs${s}`);
          const answerIndex = Math.floor(rnd() * n);
          subQuestions.push({ type: 'single', options, answerIndex, points });
          subAnswers.push(Math.floor(rnd() * n));
        } else if (st === 'boolean') {
          const correctBoolean = rnd() > 0.5;
          subQuestions.push({ type: 'boolean', correctBoolean, points });
          subAnswers.push(rnd() > 0.5);
        } else {
          const correctValue = Math.floor(rnd() * 50);
          const tolerance = Math.floor(rnd() * 3);
          subQuestions.push({ type: 'numerical', correctValue, tolerance, points });
          subAnswers.push(correctValue + Math.floor(rnd() * 5));
        }
      }
      question = { type: 'case_study', caseText: 'kasus', subQuestions, points };
      answers = [subAnswers, subAnswers.map(() => null), []];
    }

    fixtures.push({ id: `f${i}`, question, answers, points });
  }
  return fixtures;
}

const KEY_FIELDS = [
  'answerIndex',
  'correctIndices',
  'correctBoolean',
  'acceptedAnswers',
  'pairs',
  'items',
  'correctValue',
  'tolerance',
  'expectedOutput',
  'sampleSolution',
  'subQuestions'
];

/** Susun entri snapshot v3 (publik) + kunci privat, seperti produksi. */
function serverGrade(fixture) {
  const q = fixture.question;
  const entry = { id: fixture.id, type: q.type, prompt: 'p', points: fixture.points, keyRevision: '1' };
  if (q.options) entry.options = q.options;
  if (q.caseText) entry.caseText = q.caseText;
  if (q.starterCode) entry.starterCode = q.starterCode;
  if (q.subQuestions) entry.subQuestions = q.subQuestions.map((s) => ({ type: s.type, options: s.options }));

  const key = { keyRevision: '1', type: q.type };
  for (const f of KEY_FIELDS) if (f in q) key[f] = q[f];

  const attempt = {
    schemaVersion: 3,
    uid: 'u1',
    quizId: 'qz',
    status: 'in_progress',
    submittedAt: { seconds: 1 },
    questionSnapshot: [entry],
    answers: fixture.answers.map((userAnswer) => ({ questionId: fixture.id, userAnswer }))
  };
  const res = server.gradeAttemptData(attempt, new Map([[fixture.id, key]]));
  return res.answers.map((a) => ({
    isCorrect: a.isCorrect,
    pointsEarned: a.pointsEarned,
    needsManualGrade: Boolean(a.needsManualGrade)
  }));
}

const norm = (v) => (v === true ? 'true' : v === false ? 'false' : v === null || v === undefined ? 'null' : String(v));

// ---------- 4. Paritas 220 fixture ----------
test('PARITAS: 220 fixture client vs server → hasil identik', () => {
  const fixtures = buildFixtures(220);
  const details = [];
  let mismatches = 0;
  let compared = 0;

  for (const fixture of fixtures) {
    const s = serverGrade(fixture);
    for (let i = 0; i < fixture.answers.length; i += 1) {
      const c = clientGrading.gradeQuestionAnswer(fixture.question, fixture.answers[i]);
      const sv = s[i];
      compared += 1;
      if (
        Boolean(c.isManual) !== sv.needsManualGrade ||
        round2(Number(c.pointsEarned) || 0) !== round2(Number(sv.pointsEarned) || 0) ||
        norm(c.isCorrect) !== norm(sv.isCorrect)
      ) {
        mismatches += 1;
        if (details.length < 8) {
          details.push(
            `${fixture.id}/${fixture.question.type}[${i}] client=${JSON.stringify({
              isCorrect: c.isCorrect,
              pointsEarned: c.pointsEarned,
              isManual: Boolean(c.isManual)
            })} server=${JSON.stringify(sv)}`
          );
        }
      }
    }
  }
  assert.equal(mismatches, 0, `${mismatches}/${compared} mismatch:\n${details.join('\n')}`);
  assert.ok(compared >= 800, `fixture terlalu sedikit (${compared})`);
});

// ---------- 5. Kasus khusus per tipe ----------
test('PARITAS: 10 tipe soal terwakili fixture', () => {
  const types = new Set(buildFixtures(220).map((f) => f.question.type));
  for (const t of [
    'single',
    'multiple',
    'boolean',
    'short_answer',
    'matching',
    'ordering',
    'numerical',
    'essay',
    'code',
    'case_study'
  ]) {
    assert.ok(types.has(t), `tipe ${t} tidak terwakili`);
  }
});

test('PARITAS: essay & code → needsManualGrade di server', () => {
  const fixtures = buildFixtures(220).filter((f) => ['essay', 'code'].includes(f.question.type));
  assert.ok(fixtures.length > 0);
  for (const f of fixtures) {
    for (const a of serverGrade(f)) assert.equal(a.needsManualGrade, true);
  }
});

test('PARITAS: PGK parsial (1 benar 1 salah dari 2 kunci) nilainya sama', () => {
  const q = { type: 'multiple', options: ['a', 'b', 'c'], correctIndices: [0, 1], points: 10 };
  const c = clientGrading.gradeQuestionAnswer(q, [0, 2]);
  const s = serverGrade({ id: 'pgk', question: q, answers: [[0, 2]], points: 10 })[0];
  assert.equal(c.isManual, false);
  assert.ok(c.pointsEarned > 0 && c.pointsEarned < 10, 'harus parsial');
  assert.equal(round2(c.pointsEarned), round2(s.pointsEarned));
});

test('PARITAS: PGK legacy K=N tetap dinilai penuh, tidak nol', () => {
  const q = { type: 'multiple', options: ['a', 'b', 'c'], correctIndices: [0, 1, 2], points: 10 };
  const c = clientGrading.gradeQuestionAnswer(q, [0, 1, 2]);
  const s = serverGrade({ id: 'kn', question: q, answers: [[0, 1, 2]], points: 10 })[0];
  assert.equal(c.pointsEarned, 10);
  assert.equal(round2(c.pointsEarned), round2(s.pointsEarned));
});

test('PARITAS: case_study menjumlahkan poin sub-soal', () => {
  const q = {
    type: 'case_study',
    caseText: 'kasus',
    points: 20,
    subQuestions: [
      { type: 'single', options: ['a', 'b'], answerIndex: 0, points: 5 },
      { type: 'boolean', correctBoolean: true, points: 5 },
      { type: 'numerical', correctValue: 10, tolerance: 0, points: 10 }
    ]
  };
  const c = clientGrading.gradeQuestionAnswer(q, [0, true, 10]);
  const s = serverGrade({ id: 'cs', question: q, answers: [[0, true, 10]], points: 20 })[0];
  assert.equal(c.pointsEarned, 20, 'semua sub-soal benar → 20');
  assert.equal(round2(c.pointsEarned), round2(s.pointsEarned));
});

test('PARITAS: client tidak pernah menulis `fraction` ke answers', () => {
  const q = { type: 'multiple', options: ['a', 'b'], correctIndices: [0], points: 10 };
  const attempt = {
    schemaVersion: 3,
    submittedAt: { seconds: 1 },
    questionSnapshot: [{ id: 'q1', type: 'multiple', prompt: 'p', points: 10, options: ['a', 'b'], keyRevision: '1' }],
    answers: [{ questionId: 'q1', userAnswer: [0] }]
  };
  const res = server.gradeAttemptData(attempt, new Map([['q1', { correctIndices: [0], type: 'multiple' }]]));
  assert.equal('fraction' in res.answers[0], false, 'fraction tidak boleh dipersist');
});

// ---------- 6. Keamanan & idempotensi ----------
test('PARITAS: kunci hilang → pending manual, BUKAN tebakan', () => {
  const attempt = {
    schemaVersion: 3,
    submittedAt: { seconds: 1 },
    questionSnapshot: [{ id: 'q', type: 'single', prompt: 'p', points: 10, options: ['a', 'b'], keyRevision: '1' }],
    answers: [{ questionId: 'q', userAnswer: 0 }]
  };
  const res = server.gradeAttemptData(attempt, new Map());
  assert.equal(res.answers[0].needsManualGrade, true);
  assert.equal(res.answers[0].pointsEarned, 0);
  assert.deepEqual(res.gradedKeysMissing, ['q']);
  assert.equal(res.pendingManual, true);
  assert.equal(res.status, 'pending_manual_grade');
});

test('PARITAS: soal unavailable → 0 poin & perlu manual', () => {
  const attempt = {
    schemaVersion: 3,
    submittedAt: { seconds: 1 },
    questionSnapshot: [{ id: 'q', type: 'unavailable', prompt: '', points: 0, available: false }],
    answers: [{ questionId: 'q', userAnswer: null }]
  };
  const res = server.gradeAttemptData(attempt, new Map());
  assert.equal(res.answers[0].pointsEarned, 0);
  assert.equal(res.answers[0].needsManualGrade, true);
});

test('PARITAS: ignore pointsEarned yang dikirim client', () => {
  const attempt = {
    schemaVersion: 3,
    submittedAt: { seconds: 1 },
    questionSnapshot: [{ id: 'q', type: 'single', prompt: 'p', points: 10, options: ['a', 'b'], keyRevision: '1' }],
    // Client, secara tidak sengaja, mengirim jawaban benar tapi juga skor 9999.
    answers: [{ questionId: 'q', userAnswer: 0, pointsEarned: 9999, isCorrect: true }]
  };
  const res = server.gradeAttemptData(attempt, new Map([['q', { answerIndex: 0, type: 'single' }]]));
  assert.equal(res.answers[0].pointsEarned, 10, 'poin harus dari server');
  assert.equal(res.score, 10);
  assert.equal(res.maxScore, 10);
  assert.equal(res.scorePercent, 100);
});

test('PARITAS: manualScore yang sudah ada ikut terhitung', () => {
  const attempt = {
    schemaVersion: 3,
    submittedAt: { seconds: 1 },
    questionSnapshot: [{ id: 'q', type: 'essay', prompt: 'p', points: 20, keyRevision: '1' }],
    answers: [{ questionId: 'q', userAnswer: 'teks', needsManualGrade: true, manualScore: 15 }]
  };
  const res = server.gradeAttemptData(attempt, new Map([['q', { type: 'essay', sampleAnswer: 'x' }]]));
  assert.equal(res.answers[0].pointsEarned, 15);
  assert.equal(res.pendingManual, false, 'sudah dinilai manual → bukan pending');
  assert.equal(res.status, 'graded');
  assert.equal(res.score, 15);
  assert.equal(res.scorePercent, 75);
});

test('PARITAS: manualScore melebihi poin diabaikan (anti-inflasi)', () => {
  const attempt = {
    schemaVersion: 3,
    submittedAt: { seconds: 1 },
    questionSnapshot: [{ id: 'q', type: 'essay', prompt: 'p', points: 10, keyRevision: '1' }],
    answers: [{ questionId: 'q', userAnswer: 'teks', needsManualGrade: true, manualScore: 1000 }]
  };
  const res = server.gradeAttemptData(attempt, new Map([['q', { type: 'essay', sampleAnswer: 'x' }]]));
  assert.equal(res.answers[0].manualScore, null, 'nilai tak valid dibuang');
  assert.equal(res.answers[0].pointsEarned, 0);
  assert.equal(res.pendingManual, true, 'tetap menunggu penilai');
});

test('PARITAS: hash jawaban stabil & berubah saat isi berubah', () => {
  const a = [{ questionId: 'q', userAnswer: [1, 2], needsManualGrade: false, manualScore: null }];
  const b = [{ questionId: 'q', userAnswer: [1, 2], needsManualGrade: false, manualScore: null }];
  const c = [{ questionId: 'q', userAnswer: [2, 1], needsManualGrade: false, manualScore: null }];
  assert.equal(server.hashAnswers(a), server.hashAnswers(b));
  assert.notEqual(server.hashAnswers(a), server.hashAnswers(c));
});

test('PARITAS: hash berubah saat manualScore berubah (agar dinilai ulang)', () => {
  const a = [{ questionId: 'q', userAnswer: 'x', needsManualGrade: true, manualScore: 5 }];
  const b = [{ questionId: 'q', userAnswer: 'x', needsManualGrade: true, manualScore: 8 }];
  assert.notEqual(server.hashAnswers(a), server.hashAnswers(b));
});

test('PARITAS: hash tidak bergantung urutan key object', () => {
  const a = [{ questionId: 'q', userAnswer: { x: 1, y: 2 }, needsManualGrade: false }];
  const b = [{ questionId: 'q', userAnswer: { y: 2, x: 1 }, needsManualGrade: false }];
  assert.equal(server.hashAnswers(a), server.hashAnswers(b));
});

test('PARITAS: validateManualScore menolak nilai di luar batas', () => {
  const v = server.validateManualScore;
  assert.equal(v(5, 10), 5);
  assert.equal(v(0, 10), 0);
  assert.equal(v(10, 10), 10);
  assert.equal(v(11, 10), null);
  assert.equal(v(-1, 10), null);
  assert.equal(v('abc', 10), null);
  assert.equal(v(null, 10), null);
  assert.equal(v(Infinity, 10), null);
  assert.equal(v(Number.NaN, 10), null);
  assert.equal(v(undefined, 10), null);
});

test('PARITAS: countPendingManual & isFullyAuthoritative konsisten', () => {
  const a = [
    { questionId: '1', needsManualGrade: true, manualScore: null },
    { questionId: '2', needsManualGrade: true, manualScore: 5 },
    { questionId: '3', needsManualGrade: false, pointsEarned: 10 }
  ];
  assert.equal(server.countPendingManual(a), 1);
  assert.equal(server.isFullyAuthoritative(a), false);
  a[0].manualScore = 3;
  assert.equal(server.countPendingManual(a), 0);
  assert.equal(server.isFullyAuthoritative(a), true);
});

test('PARITAS: attempt belum dikirim tidak boleh dinilai', () => {
  const draft = { schemaVersion: 3, status: 'in_progress', answers: [], questionSnapshot: [] };
  assert.equal(server.shouldSkipGrading(draft), true);
  const submitted = { schemaVersion: 3, status: 'in_progress', answers: [], questionSnapshot: [], submittedAt: { seconds: 1 } };
  assert.equal(server.shouldSkipGrading(submitted), false);
  assert.equal(server.isSubmitted(submitted), true);
});

test('PARITAS: attempt tanpa jawaban tidak crash', () => {
  const attempt = { schemaVersion: 3, submittedAt: { seconds: 1 }, questionSnapshot: [] };
  const res = server.gradeAttemptData(attempt, new Map());
  assert.equal(res.score, 0);
  assert.equal(res.maxScore, 0);
  assert.equal(res.scorePercent, 0);
  assert.equal(res.pendingManual, false);
});

test('PARITAS: attempt dengan snapshot null tidak crash', () => {
  const attempt = { schemaVersion: 3, submittedAt: { seconds: 1 }, questionSnapshot: null, answers: null };
  const res = server.gradeAttemptData(attempt, null);
  assert.equal(res.score, 0);
  assert.deepEqual(res.answers, []);
});

test('PARITAS: jawaban tak dikenal (di luar snapshot) → manual, bukan dihapus diam-diam', () => {
  const attempt = {
    schemaVersion: 3,
    submittedAt: { seconds: 1 },
    questionSnapshot: [{ id: 'q', type: 'single', prompt: 'p', points: 10, options: ['a'], keyRevision: '1' }],
    answers: [{ questionId: 'lain', userAnswer: 'x' }]
  };
  const res = server.gradeAttemptData(attempt, new Map([['q', { answerIndex: 0 }]]));
  assert.equal(res.answers.length, 1);
  assert.equal(res.answers[0].needsManualGrade, true);
  assert.equal(res.answers[0].pointsEarned, 0);
});

test('PARITAS: snapshot ganda (soal sama muncul 2x) dinilai sesuai entri', () => {
  const attempt = {
    schemaVersion: 3,
    submittedAt: { seconds: 1 },
    questionSnapshot: [
      { id: 'q', type: 'single', prompt: 'p', points: 10, options: ['a', 'b'], keyRevision: '1' },
      { id: 'q', type: 'single', prompt: 'p', points: 10, options: ['a', 'b'], keyRevision: '2' }
    ],
    answers: [
      { questionId: 'q', userAnswer: 0 },
      { questionId: 'q', userAnswer: 1 }
    ]
  };
  const keys = new Map([
    ['q', { answerIndex: 0, type: 'single' }]
  ]);
  const res = server.gradeAttemptData(attempt, keys);
  assert.equal(res.answers.length, 2);
  assert.equal(res.answers[0].pointsEarned, 10);
  assert.equal(res.answers[1].pointsEarned, 0);
  assert.equal(res.maxScore, 20);
});

test('PARITAS: 300 attempt sintetis — tidak ada exception, skor selalu dalam rentang', () => {
  const fixtures = buildFixtures(300);
  for (const f of fixtures) {
    const res = serverGrade(f);
    for (const a of res) {
      assert.ok(Number.isFinite(a.pointsEarned), 'poin harus finite');
      assert.ok(a.pointsEarned >= 0, 'poin tidak negatif');
      assert.ok(a.pointsEarned <= f.points + 1e-9, `poin ${a.pointsEarned} > ${f.points}`);
    }
  }
});

test('PARITAS: hash jawaban unik untuk 1000 kombinasi acak (tidak ada tabrakan)', () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i += 1) {
    const h = server.hashAnswers([
      { questionId: `q${i % 7}`, userAnswer: randomBytes(8).toString('hex'), needsManualGrade: i % 3 === 0, manualScore: i % 2 ? i : null }
    ]);
    assert.equal(seen.has(h), false, 'tabrakan hash terdeteksi');
    seen.add(h);
  }
  assert.equal(seen.size, 1000);
});
