import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendQuestionIds,
  buildQuizQuestionRows,
  moveQuestionIdAt,
  removeQuestionIdAt
} from '../src/features/quizzes/utils/quizQuestions.js';
import {
  normalizeQuestionIds,
  normalizeQuizSettings,
  normalizeQuizText,
  QUIZ_SHOW_ANSWER_MODES
} from '../src/features/quizzes/utils/quizSettings.js';
import { QUIZ_SETTINGS_DEFAULTS } from '../src/lib/constants.js';

const q = (id, extra = {}) => ({ id, prompt: `Prompt ${id}`, type: 'single', points: 10, ...extra });
const ids = (n) => Array.from({ length: n }, (_, i) => `q${i + 1}`);

test('baris mengikuti urutan questionIds, bukan urutan bank soal', () => {
  const rows = buildQuizQuestionRows(['q3', 'q1', 'q2'], [q('q1'), q('q2'), q('q3')]);
  assert.deepEqual(rows.map((r) => r.questionId), ['q3', 'q1', 'q2']);
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2]);
  assert.equal(rows[0].question.id, 'q3');
});

test('baris TIDAK diurutkan ulang oleh createdAt/updatedAt/difficulty', () => {
  const questions = [
    q('a', { updatedAt: 999, difficulty: 'advanced' }),
    q('b', { updatedAt: 1, difficulty: 'beginner' })
  ];
  const rows = buildQuizQuestionRows(['b', 'a'], questions);
  assert.deepEqual(rows.map((r) => r.questionId), ['b', 'a']);
  assert.equal(rows[0].question.difficulty, 'beginner');
});

test('soal hilang ditandai missing tanpa dibuang dari snapshot', () => {
  const rows = buildQuizQuestionRows(['a', 'hantu', 'b'], [q('a'), q('b')]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].missing, true);
  assert.equal(rows[1].question, null);
  assert.deepEqual(rows.map((r) => r.questionId), ['a', 'hantu', 'b']);
});

test('soal yang di soft-delete juga ditandai missing', () => {
  const rows = buildQuizQuestionRows(['a'], [q('a', { deletedAt: 123 })]);
  assert.equal(rows[0].missing, true);
});

test('baris tetap utuh untuk questionIds kosong / null', () => {
  assert.deepEqual(buildQuizQuestionRows([], []), []);
  assert.deepEqual(buildQuizQuestionRows(null, null), []);
});

test('append: menumpuk di belakang urutan lama', () => {
  assert.deepEqual(appendQuestionIds(['q1', 'q2'], ['q5', 'q7']), ['q1', 'q2', 'q5', 'q7']);
});

test('append: id yang sudah dipakai dilewati, tidak ada duplikat', () => {
  assert.deepEqual(appendQuestionIds(['q1', 'q2'], ['q2', 'q5']), ['q1', 'q2', 'q5']);
  assert.deepEqual(appendQuestionIds(['q1'], ['q1', 'q1']), ['q1']);
  // duplikat di dalam pilihan sendiri juga dibuang
  assert.deepEqual(appendQuestionIds([], ['x', 'x', 'y']), ['x', 'y']);
});

test('append: nilai bukan string / kosong diabaikan, input tidak dimutasi', () => {
  const base = ['q1'];
  assert.deepEqual(appendQuestionIds(base, [null, undefined, '', 'q2']), ['q1', 'q2']);
  assert.deepEqual(base, ['q1']);
});

test('remove: menghapus hanya id pada indeks tersebut', () => {
  assert.deepEqual(removeQuestionIdAt(['q1', 'q2', 'q3'], 1), ['q1', 'q3']);
  assert.deepEqual(removeQuestionIdAt(['q1', 'q2'], 0), ['q2']);
  assert.deepEqual(removeQuestionIdAt(['q1'], 0), []);
});

test('remove: indeks di luar jangkauan mengembalikan array yang sama (tanpa write)', () => {
  const ids = ['q1', 'q2'];
  assert.equal(removeQuestionIdAt(ids, 5), ids);
  assert.equal(removeQuestionIdAt(ids, -1), ids);
});

test('reorder: naik / turun memindahkan tepat satu langkah', () => {
  assert.deepEqual(moveQuestionIdAt(['q1', 'q2', 'q3'], 1, -1), ['q2', 'q1', 'q3']);
  assert.deepEqual(moveQuestionIdAt(['q1', 'q2', 'q3'], 1, 1), ['q1', 'q3', 'q2']);
  assert.deepEqual(moveQuestionIdAt(['q1', 'q2', 'q3'], 0, 1), ['q2', 'q1', 'q3']);
  assert.deepEqual(moveQuestionIdAt(['q1', 'q2', 'q3'], 2, -1), ['q1', 'q3', 'q2']);
});

test('reorder: tepi & kasus tunggal mengembalikan array yang SAMA (write dibatalkan)', () => {
  const ids = ['q1', 'q2'];
  assert.equal(moveQuestionIdAt(ids, 0, -1), ids, 'kepala tidak bisa naik');
  assert.equal(moveQuestionIdAt(ids, 1, 1), ids, 'ekor tidak bisa turun');
  const satu = ['q1'];
  assert.equal(moveQuestionIdAt(satu, 0, -1), satu);
  assert.equal(moveQuestionIdAt(satu, 0, 1), satu);
  assert.equal(moveQuestionIdAt(ids, 9, -1), ids);
});

test('reorder: tidak mengubah input (immutabel)', () => {
  const ids = ['q1', 'q2', 'q3'];
  moveQuestionIdAt(ids, 0, 1);
  removeQuestionIdAt(ids, 0);
  assert.deepEqual(ids, ['q1', 'q2', 'q3']);
});

test('kombinasi: remove lalu append pada kuis kecil tetap valid', () => {
  let ids = ['q1', 'q2', 'q3'];
  ids = removeQuestionIdAt(ids, 1);
  assert.deepEqual(ids, ['q1', 'q3']);
  ids = appendQuestionIds(ids, ['q9']);
  assert.deepEqual(ids, ['q1', 'q3', 'q9']);
  const rows = buildQuizQuestionRows(ids, [q('q1'), q('q3'), q('q9')]);
  assert.equal(rows.filter((r) => !r.missing).length, 3);
});


test('questionIds: 0, 1, dan 50 soal sah (draft kuis boleh tanpa soal)', () => {
  // Kuis boleh dibuat lebih dulu tanpa soal, lalu soal ditambahkan dari editor.
  assert.deepEqual(normalizeQuestionIds([]), []);
  assert.deepEqual(normalizeQuestionIds(['q1']), ['q1']);
  assert.equal(normalizeQuestionIds(ids(50)).length, 50);
});

test('questionIds: 51 soal tetap ditolak (batas atas tidak dilonggarkan)', () => {
  assert.throws(() => normalizeQuestionIds(ids(51)), /maksimal 50 soal/);
});

test('questionIds: duplikat ditolak, bukan dihapus diam-diam', () => {
  assert.throws(() => normalizeQuestionIds(['q1', 'q1']), /sudah ada di kuis/);
  assert.throws(() => normalizeQuestionIds(['a', 'b', 'a']), /sudah ada di kuis/);
});

test('questionIds: id kosong / non-array / kepanjangan ditolak', () => {
  assert.throws(() => normalizeQuestionIds(['q1', '   ']), /id soal kosong/);
  assert.throws(() => normalizeQuestionIds('q1'), /tidak valid/);
  assert.throws(() => normalizeQuestionIds([null]), /id soal kosong/);
  assert.throws(() => normalizeQuestionIds(['x'.repeat(101)]), /terlalu panjang/);
});

test('questionIds: id dipangkas spasi, urutan dipertahankan (snapshot)', () => {
  assert.deepEqual(normalizeQuestionIds([' q3 ', 'q1', 'q2']), ['q3', 'q1', 'q2']);
});

test('settings: default dipakai utuh saat input kosong', () => {
  assert.deepEqual(normalizeQuizSettings(), { ...QUIZ_SETTINGS_DEFAULTS });
  assert.deepEqual(normalizeQuizSettings(null), { ...QUIZ_SETTINGS_DEFAULTS });
});

test('settings: semua kunci selalu ada (syarat keys().hasOnly di rules)', () => {
  const s = normalizeQuizSettings({ timeLimitMinutes: 15 });
  assert.deepEqual(Object.keys(s).sort(), Object.keys(QUIZ_SETTINGS_DEFAULTS).sort());
  assert.equal(s.timeLimitMinutes, 15);
  assert.equal(s.passingScorePercent, 70);
});

test('CP2: questionCount dihapus — jumlah soal = panjang questionIds', () => {
  // Field lama tidak lagi menjadi bagian settings dan harus dibuang, bukan
  // diteruskan ke rules (yang kini menolak key itu lewat hasOnly).
  const s = normalizeQuizSettings({ questionCount: 5, timeLimitMinutes: 5 });
  assert.equal('questionCount' in s, false);
  assert.equal(Object.keys(s).includes('questionCount'), false);
  // Kunci `questionCount` juga tidak boleh muncul di default.
  assert.equal(Object.keys(QUIZ_SETTINGS_DEFAULTS).includes('questionCount'), false);
});

test('settings: nilai di luar rentang ditolak', () => {
  assert.throws(() => normalizeQuizSettings({ timeLimitMinutes: 481 }), /Batas waktu/);
  assert.throws(() => normalizeQuizSettings({ passingScorePercent: 101 }), /Nilai kelulusan/);
  assert.throws(() => normalizeQuizSettings({ maxAttempts: 0 }), /Batas percobaan/);
  assert.throws(() => normalizeQuizSettings({ maxAttempts: 21 }), /Batas percobaan/);
  assert.throws(() => normalizeQuizSettings({ timeLimitMinutes: 1.5 }), /Batas waktu/);
});

test('settings: tipe salah ditolak (bool wajib boolean, mode dari enum)', () => {
  assert.throws(() => normalizeQuizSettings({ allowRetry: 'true' }), /Izinkan ulangan/);
  assert.throws(() => normalizeQuizSettings({ showExplanation: 1 }), /Tampilkan pembahasan/);
  assert.throws(() => normalizeQuizSettings({ randomizeOptionOrder: 'ya' }), /Acak urutan pilihan/);
  assert.throws(() => normalizeQuizSettings({ showAnswerMode: 'selalu' }), /Mode tampilkan jawaban/);
});

test('settings: batas atas yang sah diterima, dan showAnswerMode enum utuh', () => {
  const s = normalizeQuizSettings({
    timeLimitMinutes: 480,
    passingScorePercent: 0,
    maxAttempts: 20
  });
  assert.equal(s.timeLimitMinutes, 480);
  assert.equal(s.passingScorePercent, 0);
  assert.equal(s.maxAttempts, 20);
  for (const mode of QUIZ_SHOW_ANSWER_MODES) {
    assert.equal(normalizeQuizSettings({ showAnswerMode: mode }).showAnswerMode, mode);
  }
});

test('settings: kunci asing dibuang (rules menolak hasOnly, bukan gagal menulis)', () => {
  const s = normalizeQuizSettings({ randomizeOptionOrder: true, aplikasiKode: 'x' });
  assert.equal(s.randomizeOptionOrder, true);
  assert.equal('aplikasiKode' in s, false);
});

test('teks kuis: title wajib, topic wajib, batas panjang ditegakkan', () => {
  assert.deepEqual(normalizeQuizText({ title: ' Kuis 1 ', topicId: 'topic1' }), {
    title: 'Kuis 1',
    description: '',
    topicId: 'topic1'
  });
  assert.throws(() => normalizeQuizText({ topicId: 'topic1' }), /Judul kuis wajib/);
  assert.throws(() => normalizeQuizText({ title: '   ', topicId: 'topic1' }), /Judul kuis wajib/);
  assert.throws(() => normalizeQuizText({ title: 'a' }), /Topik kuis wajib/);
  assert.throws(() => normalizeQuizText({ title: 'x'.repeat(201), topicId: 't' }), /Judul maksimal 200/);
  assert.throws(() => normalizeQuizText({ title: 'a', topicId: 't', description: 'y'.repeat(2001) }), /Deskripsi maksimal 2000/);
});
