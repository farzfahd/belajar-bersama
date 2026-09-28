// Tes unit untuk attempt engine (CP2).
//
// PENTING: file ini TIDAK menguji `gradeQuestionAnswer` per tipe — itu sudah
// dicakup `tests/grading.test.mjs` (CP1). Di sini yang diuji adalah integrasi
// attempt: snapshot, auto-grading 10 tipe, siklus status, skor, timer, dan
// batas percobaan — memakai grading engine existing yang sama.
//
// Kontrak inti yang diuji di sini: `questionSnapshot` berisi ISI LENGKAP soal
// (bukan ID), dan SETELAH attempt dibuat tidak ada satu pun pembacaan Question
// Bank. Skenario A–D di bagian bawah mengunci perilaku itu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTEMPT_STATUS,
  UNAVAILABLE_TYPE,
  attemptsRemaining,
  buildAnswers,
  buildQuestionSnapshot,
  buildSnapshotEntry,
  canFinalize,
  canStartNewAttempt,
  computeDurationSeconds,
  computeScore,
  effectivePoints,
  findInProgress,
  findUnanswered,
  formatDuration,
  gradeAnswerFor,
  hasPendingManual,
  indexSnapshot,
  remainingSeconds,
  resolveAttemptStatus,
  resolveQuestion
} from '../src/features/quizzes/utils/attemptEngine.js';

// Bank soal 10 tipe untuk(auto-grading.
const Q = {
  q_single: { id: 'q_single', type: 'single', points: 10, options: ['a', 'b', 'c'], answerIndex: 1 },
  q_multi: { id: 'q_multi', type: 'multiple', points: 10, options: ['a', 'b', 'c'], correctIndices: [0, 2] },
  q_bool: { id: 'q_bool', type: 'boolean', points: 10, correctBoolean: true },
  q_short: { id: 'q_short', type: 'short_answer', points: 10, acceptedAnswers: ['Fotosintesis'] },
  q_essay: { id: 'q_essay', type: 'essay', points: 20, sampleAnswer: 'Contoh jawaban' },
  q_match: { id: 'q_match', type: 'matching', points: 10, pairs: [{ left: 'a', right: 'x' }] },
  q_order: { id: 'q_order', type: 'ordering', points: 10, items: ['x', 'y', 'z'] },
  q_num: { id: 'q_num', type: 'numerical', points: 10, correctValue: 3.14, tolerance: 0.1 },
  q_code: { id: 'q_code', type: 'code', points: 20, starterCode: '// x', expectedOutput: '4' },
  q_case: {
    id: 'q_case',
    type: 'case_study',
    points: 20,
    caseText: 'Kasus',
    subQuestions: [
      { type: 'single', prompt: 'Sub 1', options: ['a', 'b'], answerIndex: 0 },
      { type: 'numerical', prompt: 'Sub 2', correctValue: 7, tolerance: 0 }
    ]
  }
};

const SNAPSHOT_10 = Object.keys(Q);

// Jawaban benar untuk 7 tipe otomatis + 2 sub-soal case_study.
const CORRECT = {
  q_single: 1,
  q_multi: [0, 2],
  q_bool: true,
  q_short: '  FOTOSINTESIS ',
  q_match: { a: 'x' },
  q_order: ['x', 'y', 'z'],
  q_num: 3.2
};

// Bangun snapshot sungguhan (jalur yang dipakai `startAttempt`).
function snapOf(ids, bank = Q, settings = {}) {
  return buildQuestionSnapshot({ questionIds: ids, settings }, bank);
}

// ─────────────────────────── snapshot (CP2) ───────────────────────────

test('snapshot memuat seluruh soal kuis (jumlah = panjang questionIds)', () => {
  // Keputusan CP2: `questionCount` dihapus, tidak ada sampling/random-subset.
  const snap = snapOf(SNAPSHOT_10);
  assert.equal(snap.length, 10);
  assert.deepEqual(
    snap.map((e) => e.id),
    SNAPSHOT_10,
    'urutan mengikuti questionIds saat acak mati'
  );
});

test('randomizeQuestionOrder hanya mengacak urutan, bukan jumlah', () => {
  const quiz = { questionIds: SNAPSHOT_10, settings: { randomizeQuestionOrder: true } };
  const a = buildQuestionSnapshot(quiz, Q, 'seed-1');
  const b = buildQuestionSnapshot(quiz, Q, 'seed-1');
  assert.equal(a.length, 10, 'jumlah tetap — tidak ada subset');
  assert.deepEqual(a, b, 'seed sama → urutan sama (reproducible)');
  assert.deepEqual([...a].sort(), [...buildQuestionSnapshot(quiz, Q, 'seed-1')].sort(), 'isi tetap sama');
  assert.equal(buildQuestionSnapshot(quiz, Q, 'seed-2').length, 10);
});

test('snapshot berisi ISI soal, bukan ID saja', () => {
  // Ini guard utama terhadap regresi ke skema ID-only.
  const snap = snapOf(SNAPSHOT_10);
  for (const entry of snap) {
    assert.equal(typeof entry, 'object', 'entri snapshot harus object');
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.type, 'string');
    assert.equal(typeof entry.prompt, 'string', `${entry.id} harus punya prompt`);
    assert.equal(typeof entry.points, 'number', `${entry.id} harus punya points`);
  }
  const single = snap[0];
  assert.deepEqual(single.options, ['a', 'b', 'c'], 'opsi ikut tersimpan');
  assert.equal(single.answerIndex, 1, 'kunci jawaban ikut tersimpan');
});

test('snapshot tidak membawa field question yang tidak dipakai render/grading', () => {
  // Field di bawah ini TIDAK dibaca QuestionAttemptForm maupun grading.js,
  // jadi menyalinnya hanya memperbesar dokumen tanpa memperbaiki perilaku.
  const withNoise = {
    ...Q.q_single,
    topicId: 'topic1',
    difficulty: 'beginner',
    visibility: 'shared',
    tags: ['x'],
    createdBy: 'alice',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    deletedAt: null,
    commentCount: 3,
    timeLimitSeconds: 60,
    attachmentUrl: 'https://contoh.test/a.png',
    relatedNoteId: 'n1',
    relatedResourceId: 'r1',
    hasAnswerKey: true,
    schemaVersion: 1
  };
  const entry = buildSnapshotEntry(withNoise, 'q_single');
  for (const leaked of [
    'topicId', 'difficulty', 'visibility', 'tags', 'createdBy', 'createdAt',
    'updatedAt', 'deletedAt', 'commentCount', 'timeLimitSeconds', 'attachmentUrl',
    'relatedNoteId', 'relatedResourceId', 'hasAnswerKey', 'schemaVersion'
  ]) {
    assert.equal(leaked in entry, false, `${leaked} tidak boleh masuk snapshot`);
  }
  // Yang penting untuk render tetap ada; `prompt` yang hilang menjadi string
  // kosong supaya QuestionAttemptForm tidak pernah menerima undefined.
  assert.equal(entry.prompt, '');
  assert.equal(entry.answerIndex, 1);
  assert.deepEqual(entry.options, ['a', 'b', 'c']);
});

test('snapshot mendep salin: mutasi array di bank soal tidak mengubah snapshot', () => {
  const bank = { id: 'q_m', type: 'single', points: 10, options: ['a', 'b'], answerIndex: 0 };
  const entry = buildSnapshotEntry(bank, 'q_m');
  // Mutasi DI TEMPAT (bukan ganti objek baru) — termasuk bug yang harus dicegah.
  bank.options.push('c');
  bank.options[0] = 'DIROMBAI';
  assert.deepEqual(entry.options, ['a', 'b'], 'snapshot tidak boleh ikut berubah');
});

test('points default ke 10 saat dokumen soal tidak punya points', () => {
  // `grading.js:18` memakai default 10. Disalin resolved supaya attempt lama
  // tidak ikut berubah bila default atau poin di bank soal diubah belakangan.
  const entry = buildSnapshotEntry({ id: 'q_x', type: 'boolean', correctBoolean: true }, 'q_x');
  assert.equal(entry.points, 10);
  assert.equal(buildSnapshotEntry({ id: 'q_y', type: 'boolean', points: 0, correctBoolean: true }, 'q_y').points, 10);
});

test('explanation ikut tersimpan (dipakai saat review & settings.showExplanation)', () => {
  const entry = buildSnapshotEntry(
    { id: 'q_e', type: 'single', points: 10, options: ['a', 'b'], answerIndex: 0, explanation: 'Karena 1+1=2' },
    'q_e'
  );
  assert.equal(entry.explanation, 'Karena 1+1=2');
});

// ---------------------------------------------------------------------------
// KEAMANAN: `pairDraft` = draft editor, TIDAK BOLEH sampai ke peserta.
// `pairDraft.assigned` memetakan baris kiri ke indeks kanan, jadi isinya
// praktis sama dengan kunci jawaban. Kalau bocor, peserta bisa menebak
// jawaban benar sebelum menjawab, dan attempt lama ikut berubah saat draft
// di-edit owner.
// ---------------------------------------------------------------------------
test('KEAMANAN: pairDraft tidak pernah ikut ke snapshot matching', () => {
  const bank = {
    id: 'q_match',
    type: 'matching',
    points: 10,
    prompt: 'Pasangkan',
    pairs: [
      { left: 'Indonesia', right: 'Jakarta' },
      { left: 'Jepang', right: 'Tokyo' }
    ],
    pairDraft: {
      lefts: ['Indonesia', 'Jepang'],
      rights: ['Jakarta', 'Tokyo'],
      assigned: [0, 1]
    }
  };
  const entry = buildSnapshotEntry(bank, 'q_match');

  assert.equal(entry.pairDraft, undefined, 'pairDraft tidak boleh ada di snapshot');
  assert.equal('pairDraft' in entry, false);
  assert.equal('assigned' in entry, false, 'peta sambungan editor tidak boleh ikut');
  // Sanity: isi snapshot benar-benar tidak memuat kata "assigned" di mana pun.
  assert.equal(JSON.stringify(entry).includes('assigned'), false);
  // Answer key tetap ikut supaya soal bisa dinilai (hanya baris lengkap).
  assert.deepEqual(entry.pairs, bank.pairs);
});

test('KEAMANAN: pairDraft di sub-soal case_study juga dibuang', () => {
  const entry = buildSnapshotEntry(
    {
      id: 'q_case',
      type: 'case_study',
      points: 10,
      caseText: 'Kasus',
      subQuestions: [
        {
          type: 'matching',
          prompt: 'Pasangkan',
          pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }],
          pairDraft: { lefts: ['a', 'c'], rights: ['b', 'd'], assigned: [0, 1] }
        }
      ]
    },
    'q_case'
  );
  assert.equal(entry.subQuestions[0].pairDraft, undefined);
  assert.deepEqual(entry.subQuestions[0].pairs, [
    { left: 'a', right: 'b' },
    { left: 'c', right: 'd' }
  ]);
});

test('grading matching tetap memakai answer key dan tidak terganggu pairDraft', () => {
  const bank = {
    id: 'q_match',
    type: 'matching',
    points: 10,
    pairs: [
      { left: 'Indonesia', right: 'Jakarta' },
      { left: 'Jepang', right: 'Tokyo' }
    ],
    pairDraft: { lefts: ['Indonesia', 'Jepang'], rights: ['Jakarta', 'Tokyo'], assigned: [0, null] }
  };
  const entry = buildSnapshotEntry(bank, 'q_match');

  // Jawaban benar tetap benar
  const right = gradeAnswerFor('q_match', entry, { Indonesia: 'Jakarta', Jepang: 'Tokyo' });
  assert.equal(right.isCorrect, true);
  assert.equal(right.pointsEarned, 10);

  // Jawaban salah tetap salah
  const wrong = gradeAnswerFor('q_match', entry, { Indonesia: 'Tokyo', Jepang: 'Jakarta' });
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.pointsEarned, 0);

  // Baris belum dipasangkan di draft TIDAK membuat soal mustahil dijawab:
  // draft punya 3 baris tapi answer key tetap 2, jadi attempt normal.
  const threeRows = buildSnapshotEntry(
    {
      id: 'q3',
      type: 'matching',
      points: 10,
      pairs: [
        { left: 'Indonesia', right: 'Jakarta' },
        { left: 'Prancis', right: 'Paris' }
      ],
      pairDraft: {
        lefts: ['Indonesia', 'Jepang', 'Prancis'],
        rights: ['Jakarta', 'Tokyo', 'Paris'],
        assigned: [0, null, 2]
      }
    },
    'q3'
  );
  const answer = gradeAnswerFor('q3', threeRows, { Indonesia: 'Jakarta', Prancis: 'Paris' });
  assert.equal(answer.isCorrect, true, 'baris unpaired di draft tidak boleh merusak grading');
  assert.equal(answer.pointsEarned, 10);
});

test('sub-soal case_study ikut tersalin lengkap (prompt + kunci per tipe)', () => {
  const entry = buildSnapshotEntry(Q.q_case, 'q_case');
  assert.equal(entry.caseText, 'Kasus');
  assert.equal(entry.subQuestions.length, 2);
  assert.equal(entry.subQuestions[0].prompt, 'Sub 1');
  assert.equal(entry.subQuestions[0].answerIndex, 0);
  assert.deepEqual(entry.subQuestions[0].options, ['a', 'b']);
  assert.equal(entry.subQuestions[1].correctValue, 7);
});

test('sub-soal bertipe di luar 7 tipe otomatis tidak membuat crash', () => {
  // Rules melarangnya, tapi snapshot tidak boleh melempar error kalau data
  // lama/anomali lolos — entri ditandai unavailable.
  const entry = buildSnapshotEntry(
    { id: 'q_cs', type: 'case_study', points: 10, caseText: 'C', subQuestions: [{ type: 'essay' }] },
    'q_cs'
  );
  assert.equal(entry.subQuestions[0].type, UNAVAILABLE_TYPE);
});

test('soal yang tidak terbaca saat attempt dimulai → entri unavailable, tidak crash', () => {
  const snap = buildQuestionSnapshot({ questionIds: ['q_hilang'], settings: {} }, Q);
  assert.equal(snap.length, 1, 'slot tetap ada supaya indeks soal tidak bergeser');
  assert.equal(snap[0].id, 'q_hilang');
  assert.equal(snap[0].type, UNAVAILABLE_TYPE);
  assert.equal(snap[0].available, false);
  assert.equal(snap[0].points, 0);
  // Tidak boleh menyamar jadi soal bertipe sungguhan.
  for (const key of ['answerIndex', 'correctIndices', 'correctBoolean', 'correctValue', 'options', 'subQuestions']) {
    assert.equal(key in snap[0], false, `${key} tidak boleh ada di entri unavailable`);
  }
});

test('indexSnapshot memetakan id → entri, mengabaikan entri tanpa id', () => {
  const map = indexSnapshot(snapOf(SNAPSHOT_10));
  assert.equal(map.size, 10);
  assert.equal(map.get('q_single').answerIndex, 1);
  assert.equal(resolveQuestion(map, 'q_single').type, 'single');
  assert.equal(resolveQuestion(map, 'tidak_ada'), null);
  // Bentuk objek biasa tetap diterima (kompatibilitas computeScore).
  assert.equal(resolveQuestion(Q, 'q_single').type, 'single');
  assert.equal(resolveQuestion(null, 'q_single'), null);
});

// ───────────────────────── auto-grading 10 tipe ─────────────────────────

test('auto-grading 8 tipe otomatis benar', () => {
  const answers = buildAnswers(snapOf(SNAPSHOT_10), CORRECT);
  const byId = Object.fromEntries(answers.map((a) => [a.questionId, a]));
  for (const id of ['q_single', 'q_multi', 'q_bool', 'q_short', 'q_match', 'q_order', 'q_num']) {
    assert.equal(byId[id].isCorrect, true, `${id} harus benar`);
    assert.equal(byId[id].needsManualGrade, false, `${id} otomatis`);
  }
  // Tipe 1,2,3,4,6,7,8 = 7 soal otomatis x 10 poin.
  const autoAnswers = ['q_single', 'q_multi', 'q_bool', 'q_short', 'q_match', 'q_order', 'q_num'];
  assert.equal(
    autoAnswers.reduce((s, id) => s + byId[id].pointsEarned, 0),
    70
  );
  // Tipe 10 (case_study) dengan sub-soal otomatis: semua sub benar → otomatis.
  assert.equal(byId.q_case.needsManualGrade, false);
});

test('jawaban salah: isCorrect false; tipe parsial dapat kredit', () => {
  // Tipe dikotomi (single/boolean/short/numerical/matching tanpa korek)
  // bernilai 0; tipe parsial (multiple, ordering) mendapat kredit.
  const wrong = {
    q_single: 0,
    q_multi: [0], // PGK: (c=1, w=0, K=2, N=3) → F = 0.5 → 5 poin
    q_bool: false,
    q_short: 'sintesis',
    q_match: { a: 'salah' }, // 0 dari 1 pasangan benar → 0
    q_order: ['y', 'x', 'z'], // 1 dari 3 posisi benar → 3.33 poin
    q_num: 99
  };
  const answers = buildAnswers(snapOf(SNAPSHOT_10), wrong);
  const byId = Object.fromEntries(answers.map((a) => [a.questionId, a]));
  for (const a of Object.values(byId)) {
    if (a.needsManualGrade || a.questionId === 'q_case') continue;
    assert.equal(a.isCorrect, false, `${a.questionId} salah`);
  }
  assert.equal(byId.q_multi.pointsEarned, 5);
  assert.equal(byId.q_order.pointsEarned, 3.33);
  for (const id of ['q_single', 'q_bool', 'q_short', 'q_match', 'q_num']) {
    assert.equal(byId[id].pointsEarned, 0, `${id} 0 poin`);
  }
});

test('tipe 5 (uraian) & 9 (kode) masuk manual grade', () => {
  const answers = buildAnswers(snapOf(['q_essay', 'q_code']), { q_essay: 'uraian', q_code: 'kode' });
  for (const a of answers) {
    assert.equal(a.needsManualGrade, true, `${a.questionId} manual`);
    assert.equal(a.isCorrect, null, 'isCorrect null');
    assert.equal(a.pointsEarned, 0);
    assert.equal(a.manualScore, null);
  }
  assert.equal(hasPendingManual(answers), true);
  assert.equal(resolveAttemptStatus(answers), ATTEMPT_STATUS.pendingManualGrade);
  assert.equal(canFinalize(answers), false);
});

test('case_study dengan sub-soal otomatis dinilai dari kunci sub-soalnya', () => {
  const snap = snapOf(['q_case']);
  const a = gradeAnswerFor('q_case', snap[0], { 0: 0, 1: 7 });
  assert.equal(a.needsManualGrade, false, 'semua sub otomatis');
  assert.equal(a.isCorrect, true);
  assert.equal(a.pointsEarned, 20);
  // Salah satu sub salah → salah, bukan manual.
  const b = gradeAnswerFor('q_case', snap[0], { 0: 1, 1: 7 });
  assert.equal(b.isCorrect, false);
});

test('case_study dengan sub-soal yang tidak bisa dinilai → manual, bukan otomatis salah', () => {
  // `validCaseStudy` hanya mengizinkan 7 sub-tipe otomatis. Sub bertipe `essay`
  // tidak bisa muncul di dokumen valid, tapi kalau data rusak/lama lolos,
  // snapshot menandainya `unavailable` dan soalnya HARUS masuk antrean manual.
  const snap = snapOf(['q_case2'], {
    q_case2: {
      id: 'q_case2', type: 'case_study', points: 20, caseText: 'Kasus',
      subQuestions: [{ type: 'single', options: ['a', 'b'], answerIndex: 0 }, { type: 'essay' }]
    }
  });
  assert.equal(snap[0].subQuestions[1].type, UNAVAILABLE_TYPE, 'sub tak terdukung jadi unavailable');
  const a = gradeAnswerFor('q_case2', snap[0], { 0: 0, 1: 'tulis' });
  assert.equal(a.needsManualGrade, true, 'seluruh soal jadi manual');
  assert.equal(a.isCorrect, null);
  assert.equal(a.pointsEarned, 0, 'belum ada poin otomatis');
  // Dan attempt jadi menunggu penilaian, bukan bisa langsung difinalisasi.
  assert.equal(canFinalize([a]), false);
});

test('soal hilang tidak crash dan tidak otomatis dapat nilai penuh', () => {
  const snap = snapOf(['q_hilang'], {});
  const a = gradeAnswerFor('q_hilang', snap[0], 'apa saja');
  assert.equal(a.needsManualGrade, true, 'ditandai manual, bukan otomatis benar');
  assert.equal(a.isCorrect, null);
  assert.equal(a.pointsEarned, 0);
  // Sumber null (legacy/serius) juga aman.
  assert.equal(gradeAnswerFor('q_null', null, null).needsManualGrade, true);
});

// ─────────────────────────── skor & status ───────────────────────────

test('computeScore — manual score dipakai, belum dinilai = 0', () => {
  const answers = buildAnswers(snapOf(['q_single', 'q_essay', 'q_code']), {
    q_single: 1, q_essay: 'uraian', q_code: 'kode'
  });
  const bank = indexSnapshot(snapOf(['q_single', 'q_essay', 'q_code']));
  // Tanpa nilai manual: skor hanya dari soal otomatis.
  let s = computeScore(answers, bank);
  assert.equal(s.score, 10, 'hanya single yang otomatis benar');
  assert.equal(s.maxScore, 50, '10 (single) + 20 (uraian) + 20 (kode)');
  assert.equal(s.scorePercent, 20);
  assert.equal(s.pending, true);

  // Setelah partner memberi 15/20 untuk uraian dan 10/20 untuk kode.
  const graded = answers.map((a) =>
    a.questionId === 'q_essay' ? { ...a, manualScore: 15 } : a.questionId === 'q_code' ? { ...a, manualScore: 10 } : a
  );
  s = computeScore(graded, bank);
  assert.equal(s.score, 35, '10 otomatis + 15 + 10 manual');
  assert.equal(s.maxScore, 50);
  assert.equal(s.scorePercent, 70);
  assert.equal(s.pending, false);
  assert.equal(resolveAttemptStatus(graded), ATTEMPT_STATUS.completed);
  assert.equal(canFinalize(graded), true);
});

test('effectivePoints — manual 0/null tidak menambah skor', () => {
  assert.equal(effectivePoints({ needsManualGrade: true, manualScore: 0, pointsEarned: 0 }), 0);
  assert.equal(effectivePoints({ needsManualGrade: true, manualScore: null, pointsEarned: 0 }), 0);
  assert.equal(effectivePoints({ needsManualGrade: true, manualScore: 7, pointsEarned: 0 }), 7);
  assert.equal(effectivePoints({ needsManualGrade: false, pointsEarned: 5, manualScore: 99 }), 5);
});

test('computeScore aman untuk maxScore 0 (semua soal hilang)', () => {
  const snap = snapOf(['q_hilang'], {});
  const answers = buildAnswers(snap, { q_hilang: 'x' });
  const s = computeScore(answers, indexSnapshot(snap));
  assert.equal(s.maxScore, 0);
  assert.equal(s.scorePercent, 0, 'tidak bagi nol');
  assert.equal(s.score, 0);
});

// ─────────────────────────── timer & kuota ───────────────────────────

test('timer — remainingSeconds & formatDuration', () => {
  const start = 1_000_000;
  assert.equal(remainingSeconds(2, start, start), 120);
  assert.equal(remainingSeconds(2, start + 30_000, start), 90);
  assert.equal(remainingSeconds(2, start + 130_000, start), 0, 'clamp di 0');
  assert.equal(remainingSeconds(0, start, start), null, 'tanpa batas waktu');
  assert.equal(remainingSeconds(2, start, null), null, 'startAt tak terbaca');

  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(3725), '1:02:05');
});

test('computeDurationSeconds aman & tidak negatif', () => {
  assert.equal(computeDurationSeconds(1000, 61000), 60);
  assert.equal(computeDurationSeconds(61000, 1000), 0, 'dibatasi 0');
  assert.equal(computeDurationSeconds(null, 61000), null);
  assert.equal(computeDurationSeconds(new Date(1000), new Date(61000)), 60);
});

test('maxAttempts & allowRetry membatasi "Coba Lagi"', () => {
  const done = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, status: ATTEMPT_STATUS.completed }));
  assert.equal(attemptsRemaining([], 3), 3);
  assert.equal(attemptsRemaining(done(2), 3), 1);
  assert.equal(attemptsRemaining(done(3), 3), 0);
  assert.equal(canStartNewAttempt(done(2), 3, true), true);
  assert.equal(canStartNewAttempt(done(3), 3, true), false, 'habis kuota');
  assert.equal(canStartNewAttempt([], 3, false), false, 'allowRetry=false');
});

test('findInProgress menemukan attempt milik sendiri yang berjalan', () => {
  const attempts = [
    { id: 'a1', uid: 'u1', status: ATTEMPT_STATUS.completed },
    { id: 'a2', uid: 'u1', status: ATTEMPT_STATUS.inProgress },
    { id: 'a3', uid: 'u2', status: ATTEMPT_STATUS.inProgress }
  ];
  assert.equal(findInProgress(attempts, 'u1')?.id, 'a2');
  assert.equal(findInProgress(attempts, 'u2')?.id, 'a3');
  assert.equal(findInProgress(attempts, 'u3'), null);
  assert.equal(findInProgress([], 'u1'), null);
});

test('buildAnswers menandai soal belum dijawab sebagai null', () => {
  const answers = buildAnswers(snapOf(['q_single', 'q_essay']), {});
  assert.equal(answers.length, 2, 'satu entri per soal, stabil');
  assert.equal(answers[0].userAnswer, null);
  assert.equal(answers[0].isCorrect, false, 'tidak dijawab = salah');
  assert.equal(answers[1].needsManualGrade, true);
  assert.equal(answers[0].questionId, 'q_single');
  assert.equal(answers[1].questionId, 'q_essay');
});

test('status lifecycle lengkap', () => {
  assert.equal(ATTEMPT_STATUS.inProgress, 'in_progress');
  assert.equal(ATTEMPT_STATUS.completed, 'completed');
  assert.equal(ATTEMPT_STATUS.pendingManualGrade, 'pending_manual_grade');
  assert.equal(ATTEMPT_STATUS.graded, 'graded');
  // Selesai tanpa manual → completed.
  assert.equal(
    resolveAttemptStatus(buildAnswers(snapOf(['q_single']), { q_single: 1 })),
    ATTEMPT_STATUS.completed
  );
});

// ═══════════════ REGRESI A–D: konsistensi snapshot vs Question Bank ═══════════════
//
// Tes-tes di bawah inilah yang GAGAL kalau `questionSnapshot` pernah kembali
// jadi ID saja (bug yang ditemukan saat audit CP2).

test('A — start attempt menghasilkan snapshot berisi isi soal', () => {
  const snap = snapOf(['q_single']);
  const entry = snap[0];
  assert.equal(entry.id, 'q_single');
  assert.equal(entry.type, 'single');
  assert.equal(entry.answerIndex, 1);
  assert.deepEqual(entry.options, ['a', 'b', 'c']);
  assert.equal(entry.points, 10);
  // Entri snapshot inilah yang jadi sumber `answers`.
  const answers = buildAnswers(snap, {});
  assert.equal(answers[0].questionId, 'q_single');
});

test('B — question DIEDIT setelah attempt dimulai: attempt lama pakai versi lama', () => {
  const snap = snapOf(['q_single']);
  // Soal asli diubah di Question Bank: kunci jawaban pindah, teks berubah.
  Q.q_single.answerIndex = 2;
  Q.q_single.options = ['satu', 'dua', 'tiga', 'empat'];
  try {
    const bank = indexSnapshot(snap);
    // Attempt lama harus tetap melihat prompt/opsi/kunci VERSI LAMA.
    const entry = bank.get('q_single');
    assert.equal(entry.answerIndex, 1, 'kunci lama, bukan kunci baru');
    assert.deepEqual(entry.options, ['a', 'b', 'c'], 'opsi lama, bukan opsi baru');
    // Jawaban sesuai versi lama (indeks 1) tetap dianggap benar.
    const [answer] = buildAnswers(snap, { q_single: 1 });
    assert.equal(answer.isCorrect, true);
  } finally {
    // Kembalikan bank soal agar tes lain tidak terpengaruh.
    Q.q_single.answerIndex = 1;
    Q.q_single.options = ['a', 'b', 'c'];
  }
});

test('B — question diubah TIDAK mengubah skor attempt lama', () => {
  const snap = snapOf(['q_single']);
  const answers = buildAnswers(snap, { q_single: 1 });
  const bank = indexSnapshot(snap);
  Q.q_single.points = 99;
  try {
    assert.equal(computeScore(answers, bank).maxScore, 10, 'maxScore lama, bukan 99');
  } finally {
    Q.q_single.points = 10;
  }
});

test('C — question DIHAPUS setelah attempt dimulai: attempt tetap dirender dari snapshot', () => {
  const snap = snapOf(['q_single']);
  // Soal dihapus (soft-delete & purge) → tidak ada di Question Bank lagi.
  delete Q.q_single;
  try {
    const bank = indexSnapshot(snap);
    const entry = bank.get('q_single');
    assert.ok(entry, 'entri snapshot masih ada');
    // Semua yang dibutuhkan render & review masih terbaca.
    assert.equal(entry.type, 'single');
    assert.deepEqual(entry.options, ['a', 'b', 'c']);
    assert.equal(entry.answerIndex, 1);
    assert.equal(entry.points, 10);
    // Tidak sedang dalam kondisi "tidak tersedia".
    assert.notEqual(entry.available, false);
    // Dan tetap bisa dinilai.
    const [answer] = buildAnswers(snap, { q_single: 1 });
    assert.equal(answer.isCorrect, true);
    assert.equal(answer.pointsEarned, 10);
  } finally {
    Q.q_single = { id: 'q_single', type: 'single', points: 10, options: ['a', 'b', 'c'], answerIndex: 1 };
  }
});

test('C — kuis diubah (soal ditambah/dikurangi): attempt lama tidak berubah', () => {
  const snap = snapOf(['q_single', 'q_bool']);
  // Kuis dirombak setelah attempt dimulai.
  const newQuiz = { questionIds: ['q_multi', 'q_num'], settings: {} };
  assert.equal(buildQuestionSnapshot(newQuiz, Q).length, 2, 'kuis baru punya 2 soal');
  // Attempt lama tetap 2 soal & tidak ikut berubah.
  assert.equal(snap.length, 2);
  assert.deepEqual(snap.map((e) => e.id), ['q_single', 'q_bool']);
  assert.deepEqual(indexSnapshot(snap).get('q_single').options, ['a', 'b', 'c']);
});

test('D — grading attempt lama memakai answer key dari snapshot (10 tipe)', () => {
  const snap = snapOf(SNAPSHOT_10);
  const bank = indexSnapshot(snap);

  // Skenario persis seperti laporan bug: kunci di bank soal diubah SEMUA,
  // lalu attempt lama dinilai ulang HANYA dari snapshot.
  const correct = { ...CORRECT, q_case: { 0: 0, 1: 7 } };
  const answers = buildAnswers(snap, correct);
  const byId = Object.fromEntries(answers.map((a) => [a.questionId, a]));

  // 7 tipe otomatis: semua benar.
  for (const id of ['q_single', 'q_multi', 'q_bool', 'q_short', 'q_match', 'q_order', 'q_num']) {
    assert.equal(byId[id].isCorrect, true, `${id} benar dari snapshot`);
    assert.equal(byId[id].pointsEarned, 10, `${id} 10 poin`);
  }
  // 2 tipe manual: menunggu penilai, bukan otomatis salah.
  for (const id of ['q_essay', 'q_code']) {
    assert.equal(byId[id].needsManualGrade, true, `${id} manual`);
    assert.equal(byId[id].isCorrect, null);
  }
  // Tipe 10: sub-soal otomatis dinilai dari kunci snapshot.
  assert.equal(byId.q_case.needsManualGrade, false);
  assert.equal(byId.q_case.isCorrect, true);
  assert.equal(byId.q_case.pointsEarned, 20);

  // Total max: 7x10 (otomatis) + 20 (uraian) + 20 (kode) + 20 (studi kasus) = 130.
  // Skor: 70 otomatis + 20 studi kasus; uraian & kode masih 0 (menunggu manual).
  const s = computeScore(answers, bank);
  assert.equal(s.maxScore, 130);
  assert.equal(s.score, 90);
  assert.equal(s.scorePercent, 69.2);
  assert.equal(s.pending, true, 'uraian & kode masih menunggu penilaian');

  // Sekarang bank soal DICORET: semua kunci dibalik. Attempt lama TIDAK boleh
  // ikut berubah — inilah bukti bahwa grading tidak menyentuh Question Bank.
  for (const q of Object.values(Q)) {
    if (q.type === 'single') q.answerIndex = 0;
    if (q.type === 'boolean') q.correctBoolean = false;
    if (q.type === 'short_answer') q.acceptedAnswers = ['SALAH'];
    if (q.type === 'numerical') { q.correctValue = -1; q.tolerance = 0; }
    if (q.type === 'ordering') q.items = [...q.items].reverse();
    if (q.type === 'multiple') q.correctIndices = [1];
  }
  try {
    const again = buildAnswers(snap, correct);
    const againById = Object.fromEntries(again.map((a) => [a.questionId, a]));
    assert.equal(againById.q_single.isCorrect, true, 'single tetap benar');
    assert.equal(againById.q_bool.isCorrect, true, 'boolean tetap benar');
    assert.equal(againById.q_short.isCorrect, true, 'short_answer tetap benar');
    assert.equal(againById.q_num.isCorrect, true, 'numerical tetap benar');
    assert.equal(againById.q_order.isCorrect, true, 'ordering tetap benar');
    assert.equal(againById.q_multi.isCorrect, true, 'multiple tetap benar');
    assert.equal(computeScore(again, bank).score, 90, 'skor attempt lama tidak berubah');
    assert.equal(computeScore(again, bank).maxScore, 130, 'maxScore lama tidak berubah');
  } finally {
    Object.assign(Q.q_single, { answerIndex: 1 });
    Object.assign(Q.q_bool, { correctBoolean: true });
    Object.assign(Q.q_short, { acceptedAnswers: ['Fotosintesis'] });
    Object.assign(Q.q_num, { correctValue: 3.14, tolerance: 0.1 });
    Object.assign(Q.q_order, { items: ['x', 'y', 'z'] });
    Object.assign(Q.q_multi, { correctIndices: [0, 2] });
  }
});

// ---- findUnanswered: penanda kelengkapan hidup di snapshot ---------------
// Tanpa sumber soal, entri yang tidak punya jawaban tetap dihitung.
test('findUnanswered: jawaban null / undefined / string kosong dihitung belum', () => {
  const answers = [
    { questionId: 'q1', userAnswer: null },
    { questionId: 'q2' },
    { questionId: 'q3', userAnswer: '   ' }
  ];
  const r = findUnanswered(answers, new Map());
  assert.equal(r.count, 3);
  assert.deepEqual(r.indices, [0, 1, 2]);
  assert.deepEqual(r.questionIds, ['q1', 'q2', 'q3']);
  assert.equal(r.hasUnanswered, true);
});

test('findUnanswered: jawaban kosong (array/object) dihitung belum', () => {
  const answers = [
    { questionId: 'q1', userAnswer: [] },
    { questionId: 'q2', userAnswer: {} }
  ];
  assert.equal(findUnanswered(answers, new Map()).count, 2);
});

test('findUnanswered: false dan 0 tetap dihitung sudah menjawab', () => {
  const answers = [
    { questionId: 'q1', userAnswer: false },
    { questionId: 'q2', userAnswer: 0 }
  ];
  const r = findUnanswered(answers, new Map());
  assert.equal(r.count, 0);
  assert.equal(r.hasUnanswered, false);
});

test('findUnanswered: jawaban terisi tidak masuk daftar', () => {
  const answers = [
    { questionId: 'q1', userAnswer: 'a' },
    { questionId: 'q2', userAnswer: [0] }
  ];
  assert.equal(findUnanswered(answers, new Map()).count, 0);
});

test('findUnanswered: soal unavailable dari snapshot tidak dihitung', () => {
  const snap = [
    { id: 'q_ok', type: 'single' },
    { id: 'q_hilang', type: 'unavailable', available: false },
    { id: 'q_kosong', type: 'short_answer' }
  ];
  const answers = buildAnswers(snap, { q_ok: 'a' });
  const r = findUnanswered(answers, indexSnapshot(snap));
  assert.deepEqual(r.indices, [2], 'hanya soal biasa yang kosong');
  assert.deepEqual(r.questionIds, ['q_kosong']);
});

test('findUnanswered: snapshot boleh dibaca dari objek biasa, bukan Map', () => {
  const snap = { q_hilang: { id: 'q_hilang', type: 'unavailable', available: false } };
  const answers = buildAnswers([snap.q_hilang], {});
  assert.equal(findUnanswered(answers, snap).count, 0);
});

test('findUnanswered: soal optional tidak dihitung sebagai belum jawab', () => {
  const snap = [{ id: 'q_opsional', type: 'short_answer', optional: true }];
  assert.equal(findUnanswered(buildAnswers(snap, {}), indexSnapshot(snap)).count, 0);
});

test('findUnanswered: input bukan array aman dan mengembalikan kosong', () => {
  for (const bad of [null, undefined, {}, 0, 'x']) {
    const r = findUnanswered(bad, new Map());
    assert.equal(r.count, 0);
    assert.equal(r.hasUnanswered, false);
  }
});
