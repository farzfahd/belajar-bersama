// ============================================================================
// ATTEMPT VERSI 3 (Assessment Security) — kunci yang dikunci & nilai yang
// tidak ditulis client.
// ============================================================================
//
// Yang diuji di sini bukan "snapshot-nya bersih" (itu sudah ada di
// `snapshot-v3.test.mjs`), tapi tiga hal yang tidak terlihat di layar:
//
//   1. REVISI KUNCI YANG BENAR. Attempt harus terkunci ke satu revisi, dan itu
//      revisi yang dikunci kuis — bukan "yang terbaru".
//   2. ENTRI JAWABAN YANG HANYA BOLEH `{questionId, userAnswer}`. Rules memakai
//      `hasOnly`, jadi satu field tambahan sekecil apa pun membuat SELURUH write
//      ditolak. Fungsi yang menahan field itu ada di client.
//   3. P2: penulis soal tidak boleh mengerjakan kuisnya sendiri.
//
// Dijalankan lewat `npm run test:units`.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNotAuthorOfQuizQuestions,
  attemptScoreLabel,
  buildAnswersV3,
  buildQuestionSnapshotV3,
  buildQuizKeyManifest,
  isAwaitingServerScore,
  isV3Attempt,
  keyRevisionFor,
  missingKeyRevisions,
  normalizeKeyRevision,
  questionsAuthoredBy,
  resolveAttemptStatusV3,
  snapshotHasLegacyKeys,
  withManualScoreV3
} from '../src/features/quizzes/utils/attemptEngine.js';
import { ALL_KEY_FIELD_NAMES } from '../src/features/questions/utils/questionKeySplit.js';

const asMap = (obj) => new Map(Object.entries(obj));

/** Dokumen soal publik yang sudah bebas kunci (hasil M1). */
const PUBLIC = {
  q1: { id: 'q1', type: 'single', prompt: 'P1', points: 10, options: ['a', 'b'], keyRevision: 2 },
  q2: { id: 'q2', type: 'boolean', prompt: 'P2', points: 5, keyRevision: 1 },
  q3: { id: 'q3', type: 'short_answer', prompt: 'P3', points: 5, keyRevision: 7 }
};

const QUIZ = { questionIds: ['q1', 'q2'], settings: {} };

// ---------- 1. Normalisasi revisi kunci ----------

test('V3: revisi kunci dinormalisasi ke bentuk yang diterima rules', () => {
  // Rules: `e.keyRevision.matches('^[1-9][0-9]*$')` — harus STRING desimal.
  assert.equal(normalizeKeyRevision(1), '1');
  assert.equal(normalizeKeyRevision(12), '12');
  assert.equal(normalizeKeyRevision('3'), '3');
  assert.equal(normalizeKeyRevision(' 4 '), '4');
  // Yang tidak bisa jadi revisi yang sah harus ditolak, bukan diteruskan.
  for (const bad of [0, -1, 1.5, '0', '01', 'abc', '', null, undefined, NaN, {}]) {
    assert.equal(normalizeKeyRevision(bad), null, `${String(bad)} seharusnya ditolak`);
  }
});

// ---------- 2. Prioritas manifest vs dokumen soal ----------

test('V3: manifest kuis menang atas keyRevision dokumen soal', () => {
  // Ini inti dari "kunci tidak ikut bergeser": kuis disusun saat soal punya
  // revisi 2, lalu kuncinya direvisi jadi 3. Attempt yang dimulai SESUDAH itu
  // harus tetap memakai 2, bukan 3.
  assert.equal(keyRevisionFor('q1', { q1: '2' }, PUBLIC.q1), '2');
});

test('V3: tanpa manifest, dipakai keyRevision dokumen soal (kuis lama)', () => {
  for (const manifest of [null, undefined, {}]) {
    assert.equal(keyRevisionFor('q1', manifest, PUBLIC.q1), '2');
  }
});

test('V3: manifest rusak TIDAK memblokir fallback', () => {
  // Manifest berisi nilai yang tidak bisa dipakai (mis. ditulis manual).
  // Menolak attempt lebih buruk daripada memakai revisi soal yang valid, jadi
  // nilainya diabaikan dan fallback yang dipakai.
  assert.equal(keyRevisionFor('q1', { q1: 0 }, PUBLIC.q1), '2');
  assert.equal(keyRevisionFor('q1', { q1: 'x' }, PUBLIC.q1), '2');
});

test('V3: manifest menyebut soal yang tidak ada -> pin tetap dipakai', () => {
  // Manifest adalah catatan kuis, bukan salinan dokumen soal. Kalau soalnya
  // belum ada (hanya terjadi kalau kuis nggak sengaja), pin di manifest tetap
  // dipakai: itu persis revisi yang HARUS dipakai kalau soalnya muncul lagi
  // di tengah attempt berjalan.
  assert.equal(keyRevisionFor('q9', { q9: '5' }, null), '5');
  // Tanpa pin DAN tanpa dokumen soal, tidak ada revisi yang bisa dijanjikan.
  assert.equal(keyRevisionFor('q9', {}, null), null);
  assert.equal(keyRevisionFor('q9', { q9: '5' }, { id: 'q9', type: 'single', keyRevision: 9 }), '5');
});

// ---------- 3. Manifest kuis ----------

test('V3: buildQuizKeyManifest memetakan soal yang punya revisi', () => {
  assert.deepEqual(buildQuizKeyManifest(['q1', 'q2'], asMap(PUBLIC)), { q1: '2', q2: '1' });
});

test('V3: manifest TIDAK memetakan soal tanpa revisi ke null', () => {
  // Entri `null` akan dibaca sebagai "sudah dikunci ke revisi yang tidak ada",
  // lalu `keyRevisionFor` diam-diam memakai fallback. `missingKeyRevisions`
  // yang harus memberi tahu, bukan manifest.
  const manifest = buildQuizKeyManifest(
    ['q1', 'tanpaRevisi'],
    new Map([
      ...asMap(PUBLIC),
      ['tanpaRevisi', { id: 'tanpaRevisi', type: 'single', options: ['a', 'b'] }]
    ])
  );
  assert.deepEqual(manifest, { q1: '2' });
  assert.equal('tanpaRevisi' in manifest, false);
});

test('V3: missingKeyRevisions menandai soal tanpa kunci yang bisa dinilai', () => {
  const byId = { ...PUBLIC, tanpaRevisi: { id: 'tanpaRevisi', type: 'single' } };
  assert.deepEqual(missingKeyRevisions(['q1', 'tanpaRevisi'], byId), ['tanpaRevisi']);
  assert.deepEqual(missingKeyRevisions(['q1', 'q2'], PUBLIC), []);
});

test('V3: soal yang hilang TIDAK diminta kuncinya', () => {
  // Entri `unavailable` selalu 0 poin + manual, jadi tidak ada dokumen kunci yang
  // perlu ada. Menagihkannya akan memblokir attempt tanpa alasan.
  assert.deepEqual(missingKeyRevisions(['q1', 'sudahHilang'], PUBLIC), []);
  assert.deepEqual(
    missingKeyRevisions(['sudahHilang'], { sudahHilang: { available: false } }),
    []
  );
});

// ---------- 4. Snapshot v3 ----------

test('V3: snapshot mengunci revisi per soal dan tidak membawa kunci', () => {
  const snapshot = buildQuestionSnapshotV3(QUIZ, asMap(PUBLIC), 'seed', { q1: '1' });
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot[0].keyRevision, '1', 'manifest harus dipakai');
  assert.equal(snapshot[1].keyRevision, '1');
  for (const entry of snapshot) {
    for (const f of ALL_KEY_FIELD_NAMES.filter((x) => x !== 'subQuestions')) {
      assert.equal(f in entry, false, `${entry.id} bocor ${f}`);
    }
  }
});

test('V3: snapshot menolak soal tanpa revisi kunci, dengan nama soalnya', () => {
  const byId = { ...PUBLIC, tanpaRevisi: { id: 'tanpaRevisi', type: 'single', options: ['a', 'b'] } };
  assert.throws(
    () => buildQuestionSnapshotV3({ questionIds: ['q1', 'tanpaRevisi'], settings: {} }, byId),
    /tanpaRevisi/
  );
});

test('V3: entri unavailable tetap punya keyRevision agar valid di rules', () => {
  // `validSnapshotEntryV3` mensyaratkan `keyRevision` untuk SEMUA entri,
  // termasuk yang soal aslinya sudah hilang.
  const snapshot = buildQuestionSnapshotV3({ questionIds: ['hilang'], settings: {} }, asMap(PUBLIC));
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].type, 'unavailable');
  assert.equal(snapshot[0].available, false);
  assert.equal(snapshot[0].points, 0);
  assert.equal(snapshot[0].keyRevision, '1');
  assert.match(snapshot[0].keyRevision, /^[1-9][0-9]*$/, 'harus cocok pola rules');
});

test('V3: urutan soal diacak hanya kalau kuis meminta', () => {
  const ids = ['q1', 'q2', 'q3'];
  const byId = asMap(PUBLIC);
  const tetap = buildQuestionSnapshotV3({ questionIds: ids, settings: {} }, byId);
  assert.deepEqual(tetap.map((e) => e.id), ids);
  const acak1 = buildQuestionSnapshotV3(
    { questionIds: ids, settings: { randomizeQuestionOrder: true } },
    byId,
    'seed-a'
  );
  const acak2 = buildQuestionSnapshotV3(
    { questionIds: ids, settings: { randomizeQuestionOrder: true } },
    byId,
    'seed-a'
  );
  assert.deepEqual(acak1.map((e) => e.id), acak2.map((e) => e.id), 'seed sama -> urutan sama');
  assert.deepEqual([...acak1.map((e) => e.id)].sort(), [...ids].sort(), 'semua soal tetap ada');
});

// ---------- 5. Entri jawaban v3 ----------

test('V3: entri jawaban HANYA questionId + userAnswer', () => {
  // `ownerAnswerEntryOk` di rules memakai `hasOnly(['questionId','userAnswer'])`.
  // Field ekstra sekecil apa pun (termasuk `isCorrect: null`) membuat write
  // ditolak, jadiIni dicek lewat daftar field, bukan `deepEqual` saja.
  const answers = buildAnswersV3([{ id: 'q1' }, { id: 'q2' }], { q1: 1 });
  assert.deepEqual(Object.keys(answers[0]).sort(), ['questionId', 'userAnswer']);
  assert.deepEqual(Object.keys(answers[1]).sort(), ['questionId', 'userAnswer']);
  assert.equal(answers[0].userAnswer, 1);
  assert.equal(answers[1].userAnswer, null, 'belum dijawab = null');
});

test('V3: entri jawaban tidak pernah undefined (Firestore menolaknya)', () => {
  const answers = buildAnswersV3([{ id: 'q1' }], { q1: null });
  for (const a of answers) {
    assert.notEqual(a.userAnswer, undefined);
  }
});

test('V3: jawaban null dari user tetap null, bukan undefined', () => {
  const answers = buildAnswersV3([{ id: 'q1' }], { q1: null });
  assert.equal(answers[0].userAnswer, null);
});

test('V3: jumlah entri jawaban = jumlah entri snapshot', () => {
  // `validQuizAttemptV3` menolak `answers.size() != questionSnapshot.size()`.
  for (const n of [1, 3, 7]) {
    const snap = Array.from({ length: n }, (_, i) => ({ id: `q${i}` }));
    assert.equal(buildAnswersV3(snap).length, n);
  }
  assert.deepEqual(buildAnswersV3(null), []);
  assert.deepEqual(buildAnswersV3(undefined, { x: 1 }), []);
});

// ---------- 6. Penilaian manual pada v3 ----------

test('V3: withManualScoreV3 hanya memakai field yang diizinkan rules', () => {
  const answers = [
    { questionId: 'q1', userAnswer: 1 },
    { questionId: 'q2', userAnswer: true },
    { questionId: 'q3', userAnswer: 'teks' }
  ];
  const next = withManualScoreV3(answers, 'q3', 4, 'Bagus', 'bob', '2026-01-01');
  assert.deepEqual(Object.keys(next[1]).sort(), ['questionId', 'userAnswer']);
  assert.deepEqual(Object.keys(next[2]).sort(), [
    'gradedAt',
    'gradedBy',
    'manualFeedback',
    'manualScore',
    'questionId',
    'userAnswer'
  ]);
  assert.equal(next[2].manualScore, 4);
  assert.equal(next[1].userAnswer, true, 'jawaban peserta tidak boleh berubah');
});

test('V3: withManualScoreV3 membuang field nilai yang bukan milik v3', () => {
  // Kalau entri v3 ternimpa entri v2 (mis. setelah migrasi), field
  // `isCorrect`/`pointsEarned` akan ikut tersalin dan rules menolaknya.
  const next = withManualScoreV3(
    [
      { questionId: 'q1', userAnswer: 1, isCorrect: true, pointsEarned: 10, needsManualGrade: false }
    ],
    'q1',
    5,
    '',
    'bob',
    '2026-01-01'
  );
  assert.deepEqual(Object.keys(next[0]).sort(), [
    'gradedAt',
    'gradedBy',
    'manualFeedback',
    'manualScore',
    'questionId',
    'userAnswer'
  ]);
});

test('V3: nilai manual negatif jadi 0 dan umpan balik dipangkas', () => {
  const next = withManualScoreV3([{ questionId: 'q1', userAnswer: 'x' }], 'q1', -5, '  halo  ', 'bob', null);
  assert.equal(next[0].manualScore, 0);
  assert.equal(next[0].manualFeedback, 'halo');
  assert.equal(next[0].manualFeedback.length <= 2000, true);
});

test('V3: entri lain yang sudah punya nilai manual tetap utuh', () => {
  const next = withManualScoreV3(
    [
      { questionId: 'q1', userAnswer: 'a', manualScore: 3, manualFeedback: 'ok', gradedBy: 'bob', gradedAt: 'x' },
      { questionId: 'q2', userAnswer: 'b' }
    ],
    'q2',
    1,
    '',
    'alice',
    'y'
  );
  assert.equal(next[0].manualScore, 3, 'nilai manual soal lain tidak boleh hilang');
  assert.equal(next[0].gradedBy, 'bob');
});

// ---------- 7. P2: penulis soal tidak boleh mengKerjakan sendiri ----------

test('V3: soal buatan sendiri terdeteksi di semua posisi', () => {
  // Rules hanya bisa memeriksa `questionIds[0..7]` (tidak ada loop). Fungsi ini
  // yang menutup sisanya di sisi client dengan pesan yang bisa ditindaklanjuti.
  const ids = Array.from({ length: 12 }, (_, i) => `q${i}`);
  const byId = Object.fromEntries(
    ids.map((id, i) => [id, { id, type: 'single', keyRevision: 1, createdBy: i === 9 ? 'alice' : 'bob' }])
  );
  // q9 ada di posisi ke-9 — di luar jangkauan `questionIds[0..7]` yang bisa
  // diperiksa rules, jadi deteksinya murni tanggung jawab fungsi ini.
  assert.deepEqual(questionsAuthoredBy('alice', { questionIds: ids }, byId), ['q9']);
  assert.deepEqual(
    questionsAuthoredBy('bob', { questionIds: ids }, byId),
    ids.filter((id) => id !== 'q9')
  );
  assert.deepEqual(questionsAuthoredBy('carol', { questionIds: ids }, byId), []);
  // Soal yang hilang tidak boleh dianggap milik siapa pun.
  assert.deepEqual(questionsAuthoredBy('alice', { questionIds: ['hilang'] }, byId), []);
  // `startAttempt` mengirim `Map`, sedangkan jalur lama mengirim objek biasa.
  // Bentuk keduanya harus sama-sama benar.
  assert.deepEqual(questionsAuthoredBy('alice', { questionIds: ids }, new Map(Object.entries(byId))), ['q9']);
  assert.deepEqual(questionsAuthoredBy('alice', { questionIds: ['q1'] }, new Map()), []);
});

test('V3: attempt ditolak kalau memuat soal buatan sendiri', () => {
  const byId = { a: { id: 'a', createdBy: 'alice' }, b: { id: 'b', createdBy: 'bob' } };
  assert.throws(
    () => assertNotAuthorOfQuizQuestions('alice', { questionIds: ['b', 'a'] }, byId),
    /soal yang kamu buat sendiri/
  );
  assert.equal(assertNotAuthorOfQuizQuestions('alice', { questionIds: ['b'] }, byId), true);
  assert.equal(assertNotAuthorOfQuizQuestions('', { questionIds: ['a'] }, byId), true, 'tanpa uid = dilewati');
});

// ---------- 8. Membaca attempt di UI ----------

test('V3: attempt v3 tanpa nilai = menunggu server', () => {
  const attempt = { schemaVersion: 3, status: 'pending_grading', submittedAt: { seconds: 1 } };
  assert.equal(isV3Attempt(attempt), true);
  assert.equal(isAwaitingServerScore(attempt), true);
  // Punya nilai -> selesai, walau statusnya masih pending_grading (server menulis
  // keduanya dalam satu operasi, jadi ini hanya belt-and-suspenders).
  assert.equal(isAwaitingServerScore({ ...attempt, score: 80 }), false);
  // Attempt lama tidak punya jalur ini sama sekali.
  assert.equal(isAwaitingServerScore({ schemaVersion: 2, score: 0 }), false);
});

test('V3: label nilai tidak pernah menampilkan 0% atau undefined%', () => {
  // "0%" berarti "salah semua" — padahal attempt-nya belum dinilai sama sekali.
  assert.equal(attemptScoreLabel({ schemaVersion: 3, status: 'pending_grading' }), 'Belum dinilai');
  assert.equal(attemptScoreLabel({ schemaVersion: 2 }), 'Belum dinilai');
  assert.equal(attemptScoreLabel({ schemaVersion: 3, scorePercent: 87.5 }), '87.5%');
  assert.equal(attemptScoreLabel({ schemaVersion: 2, scorePercent: 0 }), '0%');
});

test('V3: status setelah submit adalah pending_grading', () => {
  assert.equal(resolveAttemptStatusV3(), 'pending_grading');
});

test('V3: deteksi snapshot yang masih bocor kunci (hanya mungkin pada v2)', () => {
  assert.equal(
    snapshotHasLegacyKeys({
      schemaVersion: 2,
      questionSnapshot: [
        { id: 'q1', type: 'single', options: ['a', 'b'] },
        { id: 'q2', type: 'single', options: ['a', 'b'], answerIndex: 1 }
      ]
    }),
    true
  );
  assert.equal(
    snapshotHasLegacyKeys({ schemaVersion: 3, questionSnapshot: [{ id: 'q1', type: 'single', options: ['a', 'b'], keyRevision: '1' }] }),
    false
  );
  assert.equal(snapshotHasLegacyKeys({}), false);
});

// ---------- 9. V2 tetap utuh ----------

test('V2: jalur lama tidak ikut berubah oleh versi 3', () => {
  // Attempt v2 yang sudah tersimpan harus tetap bisa di-finalisasi pemiliknya,
  // jadi `isV3Attempt` harus membedakannya dengan tegas.
  assert.equal(isV3Attempt({ schemaVersion: 2 }), false);
  assert.equal(isV3Attempt({ schemaVersion: '2' }), false);
  assert.equal(isV3Attempt({ schemaVersion: 3 }), true);
  assert.equal(isV3Attempt({ schemaVersion: '3' }), true);
  assert.equal(isV3Attempt(null), false);
  assert.equal(isV3Attempt({}), false);
});
