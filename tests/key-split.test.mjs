// ============================================================================
// PEMISAHAN KUNCI vs DATA PUBLIK (Assessment Security, M1/PART 5/PART 6).
// ============================================================================
//
// Dijalankan lewat `npm run test:units`.
//
// Fokus test: apa pun yang userAN bisa baca TIDAK BOLEH memuat jawaban. Untuk
// `matching` dan `ordering` ada jakarta tambahan: pemisahan harus tetap
// MENJADIKAN SOAL BISA DIJAWAB, karena bila `pairs`/`items` seluruhnya pindah ke
// dokumen kunci, peserta tidak punya apa pun untuk dicocokkan/diurutkan.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_KEY_FIELD_NAMES,
  assertNoKeyFields,
  buildKeyDocument,
  buildMatchingPools,
  buildOrderingItemsPublic,
  keyFieldsForType,
  presentKeyFields,
  splitQuestionData,
  subQuestionKeyFields
} from '../src/features/questions/utils/questionKeySplit.js';

const TYPES = [
  'single',
  'multiple',
  'boolean',
  'short_answer',
  'essay',
  'matching',
  'ordering',
  'numerical',
  'code',
  'case_study'
];

// ---------- 1. Tiap tipe: kunci tidak pernah ada di bagian publik ----------

const SAMPLES = {
  single: { prompt: 'p', points: 5, options: ['a', 'b'], answerIndex: 1 },
  multiple: { prompt: 'p', points: 5, options: ['a', 'b', 'c'], correctIndices: [0, 2] },
  boolean: { prompt: 'p', points: 5, correctBoolean: true },
  short_answer: { prompt: 'p', points: 5, acceptedAnswers: ['x'] },
  essay: { prompt: 'p', points: 5, sampleAnswer: 'kuncinya' },
  matching: {
    prompt: 'p',
    points: 5,
    pairs: [
      { left: 'a', right: 'y' },
      { left: 'b', right: 'x' }
    ]
  },
  ordering: { prompt: 'p', points: 5, items: ['satu', 'dua', 'tiga'] },
  numerical: { prompt: 'p', points: 5, correctValue: 42, tolerance: 0.1 },
  code: { prompt: 'p', points: 5, starterCode: 'kode awal', expectedOutput: '2', sampleSolution: 'sol' },
  case_study: {
    prompt: 'p',
    points: 5,
    caseText: 'kasus',
    subQuestions: [
      { type: 'single', prompt: 's1', options: ['a', 'b'], answerIndex: 1 },
      { type: 'numerical', prompt: 's2', correctValue: 7, tolerance: 0 }
    ]
  }
};

test('KEY SPLIT: 10 tipe — bagian publik bebas dari semua field kunci', () => {
  for (const type of TYPES) {
    const { public: pub } = splitQuestionData(type, SAMPLES[type], 'q1');
    const found = presentKeyFields(pub);
    assert.deepEqual(found, [], `${type}: publik bocor ${found.join(', ')}`);
    assert.equal(pub.type, type, `${type}: 'type' wajib ikut ke bagian publik`);
  }
});

test('KEY SPLIT: kunci tiap tipe memang terpisah ke dokumen key', () => {
  const expectations = {
    single: ['answerIndex'],
    multiple: ['correctIndices'],
    boolean: ['correctBoolean'],
    short_answer: ['acceptedAnswers'],
    essay: ['sampleAnswer'],
    matching: ['pairs'],
    ordering: ['items'],
    numerical: ['correctValue', 'tolerance'],
    code: ['expectedOutput', 'sampleSolution'],
    case_study: ['subQuestions']
  };
  for (const [type, expected] of Object.entries(expectations)) {
    const { key } = splitQuestionData(type, SAMPLES[type], 'q1');
    for (const f of expected) {
      assert.ok(f in key, `${type}: field kunci ${f} tidak masuk key`);
    }
  }
});

test('KEY SPLIT: keyFieldsForType cocok untuk 10 tipe', () => {
  for (const type of TYPES) {
    assert.ok(Array.isArray(keyFieldsForType(type)), `${type} tidak punya daftar field kunci`);
    assert.ok(keyFieldsForType(type).length > 0, `${type} seharusnya punya minimal 1 field kunci`);
  }
  assert.deepEqual(keyFieldsForType('tidak-ada'), []);
  // Returned array harus fresh, bukan referensi internal.
  const a = keyFieldsForType('numerical');
  a.push('bocor');
  assert.deepEqual(keyFieldsForType('numerical'), ['correctValue', 'tolerance']);
});

test('KEY SPLIT: `starterCode` tetap publik (kode awal harus dilihat peserta)', () => {
  const { public: pub, key } = splitQuestionData('code', SAMPLES.code, 'q1');
  assert.equal(pub.starterCode, 'kode awal');
  assert.equal('starterCode' in key, false);
});

test('KEY SPLIT: `options` publik untuk single/multiple', () => {
  for (const type of ['single', 'multiple']) {
    const { public: pub, key } = splitQuestionData(type, SAMPLES[type], 'q1');
    assert.deepEqual(pub.options, SAMPLES[type].options);
    assert.equal('options' in key, false, 'opsi bukan kunci');
  }
});

test('KEY SPLIT: `prompt`/`points`/meta tetap publik', () => {
  const data = { ...SAMPLES.single, topicId: 't1', difficulty: 'sedang', visibility: 'private', tags: ['a'] };
  const { public: pub } = splitQuestionData('single', data, 'q1');
  assert.equal(pub.prompt, 'p');
  assert.equal(pub.points, 5);
  assert.equal(pub.topicId, 't1');
  assert.equal(pub.difficulty, 'sedang');
  assert.equal(pub.visibility, 'private');
  assert.deepEqual(pub.tags, ['a']);
});

test('KEY SPLIT: field asing tidak masuk ke publik maupun key', () => {
  const { public: pub, key } = splitQuestionData('single', { prompt: 'p', jawaban: 'x', __proto__x: 1 }, 'q1');
  assert.equal('jawaban' in pub, false);
  assert.equal('jawaban' in key, false);
});

// ---------- 2. matching: pools publik + pairs privat ----------

test('KEY SPLIT matching: kolam kandidat memuat semua left & right', () => {
  const pairs = [
    { left: 'a', right: 'y' },
    { left: 'b', right: 'x' },
    { left: 'c', right: 'z' }
  ];
  const { matchLeft, matchRight } = buildMatchingPools(pairs, 'q1');
  assert.deepEqual([...matchLeft].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...matchRight].sort(), ['x', 'y', 'z']);
});

test('KEY SPLIT matching: publik tidak membawa `pairs`, dan tetap bisa dijawab', () => {
  const { public: pub, key } = splitQuestionData('matching', SAMPLES.matching, 'q1');
  assert.equal('pairs' in pub, false, 'pairs adalah kunci');
  assert.deepEqual(key.pairs, SAMPLES.matching.pairs);
  // Syarat "bisa dijawab": kedua kolam ada dan ukurannya sama dengan kunci.
  assert.equal(pub.matchLeft.length, SAMPLES.matching.pairs.length);
  assert.equal(pub.matchRight.length, SAMPLES.matching.pairs.length);
});

test('KEY SPLIT matching: kolam publik diacak, bukan urutan kunci', () => {
  const pairs = [
    { left: 'a', right: 'w' },
    { left: 'b', right: 'x' },
    { left: 'c', right: 'y' },
    { left: 'd', right: 'z' }
  ];
  const { matchLeft, matchRight } = buildMatchingPools(pairs, 'q1');
  // Yang dijamin: urutan TIDAK mengikuti urutan kunci. Koincidensi per-indeks
  // itu wajar (dua daftar diacak independen, jadi pada 4 item Chance ada yang
  // kebetulan sejajar) dan bukan kebocoran — yang berbahaya bila seluruh
  // urutan kolom kiri sama persis dengan urutan pasangan di kunci.
  assert.notDeepEqual(matchLeft, pairs.map((p) => p.left), 'kolam kiri mengikuti urutan kunci');
  assert.notDeepEqual(matchRight, pairs.map((p) => p.right), 'kolam kanan mengikuti urutan kunci');
  // Isinya tetap lengkap: tidak ada item yang hilang atau diduplikasi.
  assert.deepEqual([...matchLeft].sort(), pairs.map((p) => p.left).sort());
  assert.deepEqual([...matchRight].sort(), pairs.map((p) => p.right).sort());
});

test('KEY SPLIT matching: pengacakan deterministik (dua client lihat urutan sama)', () => {
  const pairs = [
    { left: 'a', right: 'w' },
    { left: 'b', right: 'x' },
    { left: 'c', right: 'y' }
  ];
  assert.deepEqual(buildMatchingPools(pairs, 'q1'), buildMatchingPools(pairs, 'q1'));
  // Soal berbeda → seed berbeda → urutan boleh berbeda.
  const other = buildMatchingPools(pairs, 'q2');
  assert.equal(Array.isArray(other.matchLeft), true);
});

test('KEY SPLIT matching: pasangan duplikat tidak bikin kolam kacau', () => {
  const pools = buildMatchingPools(
    [
      { left: 'a', right: 'x' },
      { left: 'a', right: 'x' },
      { left: 'b', right: 'x' }
    ],
    'q1'
  );
  assert.equal(pools.matchLeft.filter((v) => v === 'a').length, 1);
  assert.equal(pools.matchRight.filter((v) => v === 'x').length, 1);
});

test('KEY SPLIT matching: input rusak tidak crash', () => {
  assert.deepEqual(buildMatchingPools(null, 'q1'), { matchLeft: [], matchRight: [] });
  assert.deepEqual(buildMatchingPools([null, undefined, 3], 'q1'), { matchLeft: [], matchRight: [] });
});

// ---------- 3. ordering: orderItems publik + items privat ----------

test('KEY SPLIT ordering: himpunan item publik = himpunan item kunci', () => {
  const items = ['satu', 'dua', 'tiga', 'empat'];
  const publicItems = buildOrderingItemsPublic(items, 'q1');
  assert.deepEqual([...publicItems].sort(), [...items].sort());
  assert.equal(publicItems.length, items.length);
});

test('KEY SPLIT ordering: urutan publik ≠ urutan kunci pada kasus umum', () => {
  // 6 item: peluang urutan acak persis sama dengan kunci sangat kecil, jadi
  // kegagalan di sini berarti pengacakan tidak benar-benar bekerja.
  const items = ['satu', 'dua', 'tiga', 'empat', 'lima', 'enam'];
  const publicItems = buildOrderingItemsPublic(items, 'q1');
  assert.notDeepEqual(publicItems, items, 'urutan publik tidak boleh sama dengan kunci');
});

test('KEY SPLIT ordering: publik tidak membawa `items`', () => {
  const { public: pub, key } = splitQuestionData('ordering', SAMPLES.ordering, 'q1');
  assert.equal('items' in pub, false, 'items adalah kunci (urutan benar)');
  assert.deepEqual(key.items, SAMPLES.ordering.items);
  assert.equal(pub.orderItems.length, SAMPLES.ordering.items.length);
});

test('KEY SPLIT ordering: deterministik & aman dari input rusak', () => {
  const items = ['a', 'b', 'c'];
  assert.deepEqual(buildOrderingItemsPublic(items, 'q1'), buildOrderingItemsPublic(items, 'q1'));
  assert.deepEqual(buildOrderingItemsPublic(null, 'q1'), []);
  assert.deepEqual(buildOrderingItemsPublic([null, '', '  ', 'a'], 'q1'), ['a']);
});

// ---------- 4. case_study: sub-soal ikut terpisah ----------

test('KEY SPLIT case_study: sub-soal publik & sub-soal kunci terpisah', () => {
  const { public: pub, key } = splitQuestionData('case_study', SAMPLES.case_study, 'q1');
  assert.equal(pub.caseText, 'kasus');
  assert.equal(pub.subQuestions.length, 2);
  assert.equal(key.subQuestions.length, 2);
  // Sub publik: punya opsi, tidak punya jawaban.
  assert.deepEqual(pub.subQuestions[0].options, ['a', 'b']);
  assert.equal('answerIndex' in pub.subQuestions[0], false);
  assert.equal(pub.subQuestions[0].prompt, 's1');
  // Sub kunci: punya jawaban.
  assert.equal(key.subQuestions[0].answerIndex, 1);
  assert.equal(key.subQuestions[1].correctValue, 7);
  // Opsi tidak boleh bocor ke dokumen kunci.
  assert.equal('options' in key.subQuestions[0], false);
});

test('KEY SPLIT case_study: guard mendeteksi kunci di sub-soal yang belum termigrasi', () => {
  const notMigrated = {
    type: 'case_study',
    caseText: 'k',
    subQuestions: [{ type: 'single', options: ['a', 'b'], answerIndex: 1 }]
  };
  assert.throws(() => assertNoKeyFields(notMigrated, 'soal'), /field kunci/);
});

test('KEY SPLIT case_study: sub matching/ordering punya kolam & himpunan publik', () => {
  const cs = {
    type: 'case_study',
    caseText: 'k',
    subQuestions: [
      { type: 'matching', pairs: [{ left: 'a', right: 'x' }, { left: 'b', right: 'y' }] },
      { type: 'ordering', items: ['p', 'q', 'r'] }
    ]
  };
  const { public: pub, key } = splitQuestionData('case_study', cs, 'q1');
  assert.equal(pub.subQuestions[0].matchLeft.length, 2);
  assert.equal(pub.subQuestions[0].matchRight.length, 2);
  assert.deepEqual(pub.subQuestions[0].pairs, undefined);
  assert.equal(pub.subQuestions[1].orderItems.length, 3);
  assert.equal(pub.subQuestions[1].items, undefined);
  assert.deepEqual(key.subQuestions[0].pairs.length, 2);
  assert.deepEqual(key.subQuestions[1].items, ['p', 'q', 'r']);
});

test('KEY SPLIT case_study: sub-soal campuran tipe tidak bocor', () => {
  const cs = {
    type: 'case_study',
    caseText: 'k',
    subQuestions: [
      { type: 'boolean', correctBoolean: true },
      { type: 'essay', sampleAnswer: 'rahasia' },
      { type: 'code', starterCode: 'awal', expectedOutput: '2', sampleSolution: 'sol' }
    ]
  };
  const { public: pub, key } = splitQuestionData('case_study', cs, 'q1');
  assert.deepEqual(presentKeyFields(pub), []);
  assert.equal(key.subQuestions[1].sampleAnswer, 'rahasia');
  assert.equal(pub.subQuestions[2].starterCode, 'awal');
  assert.equal('expectedOutput' in pub.subQuestions[2], false);
});

test('KEY SPLIT case_study: sub-soal kosong / rusak tidak crash', () => {
  assert.doesNotThrow(() => splitQuestionData('case_study', {}, 'q1'));
  assert.doesNotThrow(() => splitQuestionData('case_study', { subQuestions: null }, 'q1'));
  assert.doesNotThrow(() => splitQuestionData('case_study', { subQuestions: [null, {}] }, 'q1'));
});

// ---------- 5. Guard & laporan ----------

test('KEY SPLIT: assertNoKeyFields menolak semua nama field kunci', () => {
  for (const f of ALL_KEY_FIELD_NAMES) {
    if (f === 'subQuestions') {
      // `subQuestions` sendiri bukan kebocoran — dokumen publik studi kasus
      // memang harus punya-nya. Yang ditolak adalah kunci DI DALAM sub-soal.
      assert.doesNotThrow(() => assertNoKeyFields({ subQuestions: [] }));
      assert.throws(
        () => assertNoKeyFields({ subQuestions: [{ type: 'single', options: ['a'], answerIndex: 0 }] }),
        /field kunci/,
        'kunci di dalam sub-soal harus ditolak'
      );
      continue;
    }
    assert.throws(
      () => assertNoKeyFields({ [f]: 'x' }),
      /field kunci/,
      `${f} seharusnya ditolak`
    );
  }
  assert.doesNotThrow(() => assertNoKeyFields({ type: 'case_study', subQuestions: [{ type: 'single', options: ['a', 'b'] }] }));
  assert.doesNotThrow(() => assertNoKeyFields({ type: 'single', prompt: 'p', points: 1 }));
  assert.doesNotThrow(() => assertNoKeyFields(null));
});

test('KEY SPLIT: presentKeyFields menghitung rekursif sub-soal', () => {
  assert.deepEqual(
    presentKeyFields({ subQuestions: [{ type: 'single', answerIndex: 1 }] }),
    ['answerIndex']
  );
  assert.deepEqual(presentKeyFields({}), []);
  assert.deepEqual(presentKeyFields(null), []);
  // Field bernilai undefined dianggap tidak ada.
  assert.deepEqual(presentKeyFields({ answerIndex: undefined }), []);
});

test('KEY SPLIT: buildKeyDocument hanya memuat field kunci + meta revisi', () => {
  const doc = buildKeyDocument('numerical', { correctValue: 5, tolerance: 0.5, prompt: 'P', pairDraft: {} }, {
    keyRevision: 3,
    createdAt: 'now'
  });
  assert.deepEqual(doc, {
    keyRevision: '3',
    type: 'numerical',
    correctValue: 5,
    tolerance: 0.5,
    schemaVersion: 1,
    createdAt: 'now'
  });
  assert.equal('prompt' in doc, false, 'prompt bukan bagian kunci');
  assert.equal('pairDraft' in doc, false, 'pairDraft tidak boleh masuk kunci');
});

test('KEY SPLIT: buildKeyDocument default revisi "1"', () => {
  assert.equal(buildKeyDocument('boolean', { correctBoolean: true }).keyRevision, '1');
});

test('KEY SPLIT: subQuestionKeyFields untuk verifikasi backfill', () => {
  assert.deepEqual(
    subQuestionKeyFields([{ type: 'single', answerIndex: 0 }, { type: 'numerical', correctValue: 1 }]).sort(),
    ['answerIndex', 'correctValue']
  );
  assert.deepEqual(subQuestionKeyFields(null), []);
  assert.deepEqual(subQuestionKeyFields([{ type: 'boolean' }]), []);
});

test('KEY SPLIT: idempoten — split dua kali dengan input sama memberi hasil sama', () => {
  for (const type of TYPES) {
    const a = splitQuestionData(type, SAMPLES[type], 'q1');
    const b = splitQuestionData(type, SAMPLES[type], 'q1');
    assert.deepEqual(a.public, b.public, `${type}: publik tidak deterministik`);
    assert.deepEqual(a.key, b.key, `${type}: kunci tidak deterministik`);
  }
});

test('KEY SPLIT: memisahkan lalu menggabung tidak menghilangkan konten yang dibutuhkan', () => {
  // Guard terakhir: untuk matching & ordering, bagian publik WAJIB memuat
  // seluruh material soal, kalau tidak peserta tidak bisa menjawab.
  const m = splitQuestionData('matching', SAMPLES.matching, 'q1');
  const allLeft = new Set(m.key.pairs.map((p) => p.left));
  const allRight = new Set(m.key.pairs.map((p) => p.right));
  assert.equal(m.public.matchLeft.every((v) => allLeft.has(v)), true);
  assert.equal(m.public.matchRight.every((v) => allRight.has(v)), true);

  const o = splitQuestionData('ordering', SAMPLES.ordering, 'q1');
  assert.deepEqual([...o.public.orderItems].sort(), [...o.key.items].sort());
});
