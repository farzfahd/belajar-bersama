import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp01,
  gradeQuestionAnswer,
  normalizeString,
  round2,
  sanitizeSelection
} from '../src/features/questions/utils/grading.js';

test('normalizeString trims and lowercases', () => {
  assert.equal(normalizeString('  Halo  Dunia  '), 'halo dunia');
});

test('round2 membulatkan ke 2 desimal', () => {
  assert.equal(round2(20 / 3), 6.67);
  assert.equal(round2(10 * (1 / 3)), 3.33);
  assert.equal(round2(15 / 3), 5);
  assert.equal(round2(2.5), 2.5);
  // Batas float representable: 1.005 tidak representable → Math.round(100.499…) = 100.
  assert.equal(round2(1.005), 1);
});

test('clamp01 mengklip ke [0,1]', () => {
  assert.equal(clamp01(-0.5), 0);
  assert.equal(clamp01(1.5), 1);
  assert.equal(clamp01(0.4), 0.4);
});

test('sanitizeSelection membuang duplikat & indeks di luar rentang (C7)', () => {
  assert.deepEqual(sanitizeSelection([2, 0, 2, 1, 9], 4), [0, 1, 2]);
  assert.deepEqual(sanitizeSelection(['0', 1.7, -1], 4), [0]);
  assert.deepEqual(sanitizeSelection(null, 4), []);
  assert.deepEqual(sanitizeSelection([], 4), []);
});

test('grade single choice — contract lengkap + fraction', () => {
  const q = { type: 'single', options: ['A', 'B', 'C'], answerIndex: 1, points: 10 };
  assert.deepEqual(gradeQuestionAnswer(q, 1), { isCorrect: true, pointsEarned: 10, isManual: false, fraction: 1 });
  assert.deepEqual(gradeQuestionAnswer(q, 0), { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 });
});

test('grade PGK (multiple) — persis benar = 1.0', () => {
  const q = { type: 'multiple', options: ['A', 'B', 'C', 'D'], correctIndices: [0, 2], points: 20 };
  assert.deepEqual(gradeQuestionAnswer(q, [2, 0]), { isCorrect: true, pointsEarned: 20, isManual: false, fraction: 1 });
});

test('grade PGK — kredit parsial γ=0.75 (bukan nol)', () => {
  const q = { type: 'multiple', options: ['A', 'B', 'C', 'D'], correctIndices: [0, 2], points: 20 };
  // (c=1, w=0) → F = 1/2
  const c_only = gradeQuestionAnswer(q, [0]);
  assert.equal(c_only.isCorrect, false);
  assert.equal(c_only.fraction, 0.5);
  assert.equal(c_only.pointsEarned, 10);
  // (c=2, w=1) → F = (2/2)(1 − 0.75·1/2) = 0.625
  const over = gradeQuestionAnswer(q, [0, 1, 2]);
  assert.equal(over.isCorrect, false);
  assert.equal(over.fraction, 0.625);
  assert.equal(over.pointsEarned, 12.5);
  // kosong → 0
  assert.deepEqual(gradeQuestionAnswer(q, []), { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 });
});

test('grade PGK — select-all = 0.25 flat (C8)', () => {
  const q43 = { type: 'multiple', options: ['A', 'B', 'C', 'D'], correctIndices: [0, 1, 2], points: 20 };
  const q108 = {
    type: 'multiple',
    options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    correctIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    points: 20
  };
  assert.equal(gradeQuestionAnswer(q43, [0, 1, 2, 3]).fraction, 0.25);
  assert.equal(gradeQuestionAnswer(q108, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).fraction, 0.25);
});

test('grade PGK — nilai vektor riset §12 (round2)', () => {
  const make = (options, correctIndices, points) => ({ type: 'multiple', options, correctIndices, points });
  // (4,3): (1,0) → 1/3; (1,1) → 0.083; (2,1) → 0.167
  const q43 = make(['A', 'B', 'C', 'D'], [0, 1, 2], 30);
  assert.equal(round2(gradeQuestionAnswer(q43, [0]).pointsEarned), round2(30 / 3));
  assert.equal(gradeQuestionAnswer(q43, [0, 3]).pointsEarned, round2(30 * 0.0833));
  assert.equal(gradeQuestionAnswer(q43, [0, 1, 3]).pointsEarned, round2(30 * 0.1667));
  // (10,8): (4,1) → 0.313
  const q108 = make(
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    [0, 1, 2, 3, 4, 5, 6, 7],
    20
  );
  assert.equal(gradeQuestionAnswer(q108, [0, 1, 2, 3, 9]).pointsEarned, round2(20 * 0.3125));
});

test('grade boolean — contract lengkap + fraction', () => {
  const q = { type: 'boolean', correctBoolean: true, points: 5 };
  assert.deepEqual(gradeQuestionAnswer(q, true), { isCorrect: true, pointsEarned: 5, isManual: false, fraction: 1 });
  assert.deepEqual(gradeQuestionAnswer(q, false), { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 });
});

test('grade short answer — contract lengkap + fraction', () => {
  const q = { type: 'short_answer', acceptedAnswers: ['Tokyo', 'tokio'], points: 10 };
  assert.deepEqual(gradeQuestionAnswer(q, '  TOKYO '), { isCorrect: true, pointsEarned: 10, isManual: false, fraction: 1 });
  assert.deepEqual(gradeQuestionAnswer(q, 'Jakarta'), { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 });
});

test('grade essay — manual, fraction 0', () => {
  const q = { type: 'essay', points: 10 };
  const res = gradeQuestionAnswer(q, 'Jawaban panjang');
  assert.equal(res.isManual, true);
  assert.equal(res.isCorrect, null);
  assert.equal(res.pointsEarned, 0);
  assert.equal(res.fraction, 0);
});

test('grade matching — contract lengkap + kredit parsial', () => {
  const q = {
    type: 'matching',
    pairs: [
      { left: 'ID', right: 'Indonesia' },
      { left: 'MY', right: 'Malaysia' }
    ],
    points: 10
  };
  assert.deepEqual(gradeQuestionAnswer(q, { ID: 'Indonesia', MY: 'Malaysia' }), {
    isCorrect: true,
    pointsEarned: 10,
    isManual: false,
    fraction: 1
  });
  // Separuh pasangan benar → fraction 0.5, bukan nol.
  const partial = gradeQuestionAnswer(q, { ID: 'Indonesia', MY: 'Singapura' });
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.fraction, 0.5);
  assert.equal(partial.pointsEarned, 5);
  // Tidak ada yang benar → 0.
  assert.deepEqual(gradeQuestionAnswer(q, { ID: 'Singapura', MY: 'Indonesia' }), {
    isCorrect: false,
    pointsEarned: 0,
    isManual: false,
    fraction: 0
  });
});

test('grade ordering — contract lengkap + kredit parsial (posisi benar)', () => {
  const q = { type: 'ordering', items: ['Langkah 1', 'Langkah 2', 'Langkah 3'], points: 15 };
  assert.deepEqual(gradeQuestionAnswer(q, ['Langkah 1', 'Langkah 2', 'Langkah 3']), {
    isCorrect: true,
    pointsEarned: 15,
    isManual: false,
    fraction: 1
  });
  // Hanya posisi ketiga benar → fraction 1/3.
  const partial = gradeQuestionAnswer(q, ['Langkah 2', 'Langkah 1', 'Langkah 3']);
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.fraction, 1 / 3);
  assert.equal(partial.pointsEarned, 5);
  // Panjang berbeda → 0 tanpa crash.
  assert.deepEqual(gradeQuestionAnswer(q, ['Langkah 1']), {
    isCorrect: false,
    pointsEarned: 0,
    isManual: false,
    fraction: 0
  });
});

test('grade numerical — contract lengkap + fraction', () => {
  const q = { type: 'numerical', correctValue: 3.14, tolerance: 0.01, points: 10 };
  assert.deepEqual(gradeQuestionAnswer(q, 3.141), { isCorrect: true, pointsEarned: 10, isManual: false, fraction: 1 });
  assert.deepEqual(gradeQuestionAnswer(q, 3.12), { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 });
});

test('grade code question — manual, fraction 0', () => {
  const q = { type: 'code', starterCode: 'def foo(): pass', points: 20 };
  const res = gradeQuestionAnswer(q, 'def foo(): return 1');
  assert.equal(res.isManual, true);
  assert.equal(res.isCorrect, null);
  assert.equal(res.fraction, 0);
});

test('grade case study — sub kredit parsial dijumlahkan (round2)', () => {
  const q = {
    type: 'case_study',
    points: 20,
    caseText: 'Sebuah studi kasus...',
    subQuestions: [
      { type: 'single', options: ['A', 'B'], answerIndex: 0 },
      { type: 'boolean', correctBoolean: true }
    ]
  };
  const resSuccess = gradeQuestionAnswer(q, { 0: 0, 1: true });
  assert.equal(resSuccess.isCorrect, true);
  assert.equal(resSuccess.pointsEarned, 20);
  assert.equal(resSuccess.fraction, 1);

  // Satu sub benar (10) + satu salah (0) → point 10, fraction 0.5.
  const resPartial = gradeQuestionAnswer(q, { 0: 0, 1: false });
  assert.equal(resPartial.isCorrect, false);
  assert.equal(resPartial.pointsEarned, 10);
  assert.equal(resPartial.fraction, 0.5);

  // Tidak menjawab sama sekali → 0.
  const resEmpty = gradeQuestionAnswer(q, {});
  assert.equal(resEmpty.pointsEarned, 0);
  assert.equal(resEmpty.fraction, 0);
});

test('Tipe tak dikenal → 0 tanpa crash', () => {
  assert.deepEqual(gradeQuestionAnswer({ type: 'ghost', points: 10 }, 'x'), {
    isCorrect: false,
    pointsEarned: 0,
    isManual: false,
    fraction: 0
  });
});