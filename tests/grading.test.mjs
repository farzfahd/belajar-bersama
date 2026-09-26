import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeQuestionAnswer, normalizeString } from '../src/features/questions/utils/grading.js';

test('normalizeString trims and lowercases', () => {
  assert.equal(normalizeString('  Halo  Dunia  '), 'halo dunia');
});

test('grade single choice', () => {
  const q = { type: 'single', options: ['A', 'B', 'C'], answerIndex: 1, points: 10 };
  assert.deepEqual(gradeQuestionAnswer(q, 1), { isCorrect: true, pointsEarned: 10, isManual: false });
  assert.deepEqual(gradeQuestionAnswer(q, 0), { isCorrect: false, pointsEarned: 0, isManual: false });
});

test('grade multiple select', () => {
  const q = { type: 'multiple', options: ['A', 'B', 'C', 'D'], correctIndices: [0, 2], points: 20 };
  assert.deepEqual(gradeQuestionAnswer(q, [2, 0]), { isCorrect: true, pointsEarned: 20, isManual: false });
  assert.deepEqual(gradeQuestionAnswer(q, [0]), { isCorrect: false, pointsEarned: 0, isManual: false });
  assert.deepEqual(gradeQuestionAnswer(q, [0, 1, 2]), { isCorrect: false, pointsEarned: 0, isManual: false });
});

test('grade boolean', () => {
  const q = { type: 'boolean', correctBoolean: true, points: 5 };
  assert.deepEqual(gradeQuestionAnswer(q, true), { isCorrect: true, pointsEarned: 5, isManual: false });
  assert.deepEqual(gradeQuestionAnswer(q, false), { isCorrect: false, pointsEarned: 0, isManual: false });
});

test('grade short answer', () => {
  const q = { type: 'short_answer', acceptedAnswers: ['Tokyo', 'tokio'], points: 10 };
  assert.deepEqual(gradeQuestionAnswer(q, '  TOKYO '), { isCorrect: true, pointsEarned: 10, isManual: false });
  assert.deepEqual(gradeQuestionAnswer(q, 'Jakarta'), { isCorrect: false, pointsEarned: 0, isManual: false });
});

test('grade essay', () => {
  const q = { type: 'essay', points: 10 };
  const res = gradeQuestionAnswer(q, 'Jawaban panjang');
  assert.equal(res.isManual, true);
  assert.equal(res.isCorrect, null);
});

test('grade matching', () => {
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
    isManual: false
  });
  assert.deepEqual(gradeQuestionAnswer(q, { ID: 'Indonesia', MY: 'Singapura' }), {
    isCorrect: false,
    pointsEarned: 0,
    isManual: false
  });
});

test('grade ordering', () => {
  const q = { type: 'ordering', items: ['Langkah 1', 'Langkah 2', 'Langkah 3'], points: 15 };
  assert.deepEqual(gradeQuestionAnswer(q, ['Langkah 1', 'Langkah 2', 'Langkah 3']), {
    isCorrect: true,
    pointsEarned: 15,
    isManual: false
  });
  assert.deepEqual(gradeQuestionAnswer(q, ['Langkah 2', 'Langkah 1', 'Langkah 3']), {
    isCorrect: false,
    pointsEarned: 0,
    isManual: false
  });
});

test('grade numerical', () => {
  const q = { type: 'numerical', correctValue: 3.14, tolerance: 0.01, points: 10 };
  assert.deepEqual(gradeQuestionAnswer(q, 3.141), { isCorrect: true, pointsEarned: 10, isManual: false });
  assert.deepEqual(gradeQuestionAnswer(q, 3.12), { isCorrect: false, pointsEarned: 0, isManual: false });
});

test('grade code question', () => {
  const q = { type: 'code', starterCode: 'def foo(): pass', points: 20 };
  const res = gradeQuestionAnswer(q, 'def foo(): return 1');
  assert.equal(res.isManual, true);
  assert.equal(res.isCorrect, null);
});

test('grade case study', () => {
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

  const resPartial = gradeQuestionAnswer(q, { 0: 0, 1: false });
  assert.equal(resPartial.isCorrect, false);
  assert.equal(resPartial.pointsEarned, 10);
});
