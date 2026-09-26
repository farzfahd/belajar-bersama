import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTypeFields,
  normalizeSubQuestions,
  SUB_QUESTION_TYPES,
  MAX_SUB_QUESTIONS
} from '../src/features/questions/utils/questionTypeFields.js';

const banyak = (n, f) => Array.from({ length: n }, (_, i) => f(i));

// ---------- single (answerIndex, BUKAN correctIndex) ----------
test('single: opsi 2-20 + answerIndex dipertahankan', () => {
  const f = buildTypeFields('single', { options: ['A', 'B', 'C'], answerIndex: 2 });
  assert.deepEqual(f, { options: ['A', 'B', 'C'], answerIndex: 2 });
  assert.equal('answerIndex' in f, true);
  assert.equal('correctIndex' in f, false);
  assert.deepEqual(buildTypeFields('single', { options: banyak(20, (i) => `O${i}`), answerIndex: 19 }), {
    options: banyak(20, (i) => `O${i}`),
    answerIndex: 19
  });
});

test('single: 1 opsi, 21 opsi, duplikat, kosong, answerIndex tak valid ditolak', () => {
  assert.throws(() => buildTypeFields('single', { options: ['A'], answerIndex: 0 }), /2 hingga 20/);
  assert.throws(
    () => buildTypeFields('single', { options: banyak(21, (i) => `O${i}`), answerIndex: 0 }),
    /2 hingga 20/
  );
  assert.throws(() => buildTypeFields('single', { options: ['Sama', 'Sama'], answerIndex: 0 }), /duplikat/);
  assert.throws(() => buildTypeFields('single', { options: ['A', '  '], answerIndex: 0 }), /kosong/);
  assert.throws(() => buildTypeFields('single', { options: ['A', 'B'], answerIndex: 2 }), /tidak valid/);
  assert.throws(() => buildTypeFields('single', { options: ['A', 'B'], answerIndex: -1 }), /tidak valid/);
  // float di dalam rentang juga ditolak (rules mewajibkan int).
  assert.throws(() => buildTypeFields('single', { options: ['A', 'B', 'C'], answerIndex: 1.5 }), /tidak valid/);
});

// ---------- multiple ----------
test('multiple: correctIndices unik, terurut, semua dalam rentang', () => {
  assert.deepEqual(buildTypeFields('multiple', { options: ['A', 'B', 'C'], correctIndices: [2, 0] }), {
    options: ['A', 'B', 'C'],
    correctIndices: [0, 2]
  });
  assert.throws(
    () => buildTypeFields('multiple', { options: ['A', 'B'], correctIndices: [] }),
    /kunci jawaban/
  );
  assert.throws(
    () => buildTypeFields('multiple', { options: ['A', 'B'], correctIndices: [0, 5] }),
    /kunci jawaban/
  );
  // duplikat dijahit menjadi satu, bukan error.
  assert.deepEqual(buildTypeFields('multiple', { options: ['A', 'B'], correctIndices: [1, 1] }).correctIndices, [1]);
});

// ---------- boolean ----------
test('boolean: correctBoolean selalu boolean', () => {
  assert.deepEqual(buildTypeFields('boolean', { correctBoolean: true }), { correctBoolean: true });
  assert.deepEqual(buildTypeFields('boolean', { correctBoolean: false }), { correctBoolean: false });
  assert.deepEqual(buildTypeFields('boolean', {}), { correctBoolean: false });
});

// ---------- short_answer ----------
test('short_answer: acceptedAnswers minimal 1, tanpa kosong', () => {
  assert.deepEqual(buildTypeFields('short_answer', { acceptedAnswers: [' 2 ', '', 'dua'] }), {
    acceptedAnswers: ['2', 'dua']
  });
  assert.throws(() => buildTypeFields('short_answer', { acceptedAnswers: [] }), /variasi jawaban/);
  assert.throws(() => buildTypeFields('short_answer', { acceptedAnswers: ['  '] }), /variasi jawaban/);
});

// ---------- essay (manual) ----------
test('essay: sampleAnswer opsional, tanpa auto-grading', () => {
  assert.deepEqual(buildTypeFields('essay', {}), { sampleAnswer: '' });
  assert.deepEqual(buildTypeFields('essay', { sampleAnswer: '  contoh  ' }), { sampleAnswer: 'contoh' });
  assert.equal(buildTypeFields('essay', { sampleAnswer: 'x'.repeat(6000) }).sampleAnswer.length, 5000);
});

// ---------- matching ----------
test('matching: pairs minimal 2, left/right wajib terisi', () => {
  assert.deepEqual(
    buildTypeFields('matching', {
      pairs: [{ left: ' ID ', right: 'Indonesia' }, { left: ' MY ', right: 'Malaysia' }]
    }),
    {
      pairs: [
        { left: 'ID', right: 'Indonesia' },
        { left: 'MY', right: 'Malaysia' }
      ]
    }
  );
  assert.throws(() => buildTypeFields('matching', { pairs: [{ left: 'a', right: 'b' }] }), /2 pasangan/);
  assert.throws(() => buildTypeFields('matching', { pairs: [{ left: 'a', right: '' }] }), /2 pasangan/);
});

// ---------- ordering ----------
test('ordering: items minimal 2, tanpa kosong', () => {
  assert.deepEqual(buildTypeFields('ordering', { items: [' a ', 'b', ''] }), { items: ['a', 'b'] });
  assert.throws(() => buildTypeFields('ordering', { items: ['a'] }), /2 item/);
});

// ---------- numerical ----------
test('numerical: correctValue wajib angka, tolerance >= 0', () => {
  assert.deepEqual(buildTypeFields('numerical', { correctValue: '3.5', tolerance: '0.25' }), {
    correctValue: 3.5,
    tolerance: 0.25
  });
  assert.deepEqual(buildTypeFields('numerical', { correctValue: 10 }), { correctValue: 10, tolerance: 0 });
  assert.throws(() => buildTypeFields('numerical', { correctValue: 'abc' }), /harus berupa angka/);
  assert.throws(() => buildTypeFields('numerical', {}), /harus berupa angka/);
  // tolerance negatif dijepit ke 0, mengikuti perilaku lama.
  assert.equal(buildTypeFields('numerical', { correctValue: 1, tolerance: -5 }).tolerance, 0);
});

// ---------- code (tanpa eksekusi) ----------
test('code: hanya menyimpan teks, tidak ada evaluator', () => {
  const f = buildTypeFields('code', { starterCode: 'function f(){}', expectedOutput: '1', sampleSolution: 'x' });
  assert.deepEqual(f, { starterCode: 'function f(){}', expectedOutput: '1', sampleSolution: 'x' });
  assert.deepEqual(Object.keys(f).sort(), ['expectedOutput', 'sampleSolution', 'starterCode']);
  assert.deepEqual(buildTypeFields('code', {}), { starterCode: '', expectedOutput: '', sampleSolution: '' });
});

test('tipe tak dikenal ditolak', () => {
  assert.throws(() => buildTypeFields('mystery', {}), /tidak dikenal/);
});

// ---------- case_study: satu tingkat ----------
test('case_study: caseText wajib, subQuestions boleh kosong', () => {
  assert.deepEqual(buildTypeFields('case_study', { caseText: ' Kasus ' }), {
    caseText: 'Kasus',
    subQuestions: []
  });
  assert.deepEqual(buildTypeFields('case_study', { caseText: 'K', subQuestions: null }).subQuestions, []);
  assert.throws(() => buildTypeFields('case_study', { caseText: '   ' }), /kasus studi/);
});

test('case_study: 1 tingkat sah untuk 7 tipe otomatis', () => {
  assert.deepEqual(SUB_QUESTION_TYPES, [
    'single', 'multiple', 'boolean', 'short_answer', 'matching', 'ordering', 'numerical'
  ]);
  const subs = normalizeSubQuestions([
    { type: 'boolean', correctBoolean: false },
    { type: 'single', options: ['A', 'B'], answerIndex: 1 },
    { type: 'multiple', options: ['A', 'B', 'C'], correctIndices: [0, 2] },
    { type: 'short_answer', acceptedAnswers: ['ya'] },
    { type: 'matching', pairs: [{ left: '1', right: 'satu' }, { left: '2', right: 'dua' }] },
    { type: 'ordering', items: ['a', 'b'] },
    { type: 'numerical', correctValue: 3, tolerance: 1 }
  ]);
  assert.equal(subs.length, 7);
  assert.deepEqual(subs[0], { type: 'boolean', correctBoolean: false });
  assert.equal(subs[6].correctValue, 3);
});

test('case_study: NESTED lebih dari 1 tingkat DITOLAK', () => {
  // sub-soal yang membawa subQuestions sendiri = tingkat 2.
  assert.throws(
    () => normalizeSubQuestions([
      {
        type: 'single',
        options: ['A', 'B'],
        answerIndex: 0,
        subQuestions: [{ type: 'boolean', correctBoolean: true }]
      }
    ]),
    /maksimal 1 tingkat/
  );
  // varian kunci singular.
  assert.throws(
    () => normalizeSubQuestions([{ type: 'boolean', correctBoolean: true, subQuestion: { type: 'boolean' } }]),
    /maksimal 1 tingkat/
  );
  // di posisi mana pun dalam daftar.
  assert.throws(
    () => normalizeSubQuestions([
      { type: 'boolean', correctBoolean: true },
      { type: 'single', options: ['A', 'B'], answerIndex: 0, subQuestions: [{ type: 'boolean' }] }
    ]),
    /maksimal 1 tingkat/
  );
});

test('case_study: tipe tidak didukung & struktur rusak ditolak', () => {
  for (const bad of [{ type: 'essay' }, { type: 'code' }, { type: 'case_study', caseText: 'x' }, {}, null, 'x']) {
    assert.throws(() => normalizeSubQuestions([bad]), /tidak didukung|lengkap/);
  }
  assert.throws(
    () => normalizeSubQuestions([{ type: 'single', options: ['A'], answerIndex: 0 }]),
    /2 hingga 20/
  );
  assert.throws(
    () => normalizeSubQuestions([{ type: 'boolean', correctBoolean: 'true' }]),
    /boolean/
  );
});

test('case_study: kunci asing dibuang, hanya field tipe yang tersimpan', () => {
  const [sub] = normalizeSubQuestions([
    { type: 'boolean', correctBoolean: true, points: 99, jenis: 'aneh', explanation: 'x' }
  ]);
  assert.deepEqual(Object.keys(sub), ['type', 'correctBoolean']);
});

test('case_study: batas jumlah sub-soal 10 & input tidak dimutasi', () => {
  const satu = { type: 'boolean', correctBoolean: true };
  assert.equal(normalizeSubQuestions(Array.from({ length: MAX_SUB_QUESTIONS }, () => ({ ...satu }))).length, 10);
  assert.throws(
    () => normalizeSubQuestions(Array.from({ length: 11 }, () => ({ ...satu }))),
    /maksimal 10 sub-soal/
  );
  assert.throws(() => normalizeSubQuestions('bukan-list'), /berupa daftar/);

  const raw = [{ type: 'boolean', correctBoolean: true }];
  normalizeSubQuestions(raw);
  assert.deepEqual(raw, [{ type: 'boolean', correctBoolean: true }]);
});

