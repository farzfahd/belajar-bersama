// ============================================================================
// SNAPSHOT ATTEMPT v3 — TANPA ANSWER KEY (Assessment Security, M4/PART 4).
// ============================================================================
//
// Ini adalah lapis yang menutup kebocoran TERBESAR di desain lama: `questionSnapshot`
// pada attempt v2 menyalin kunci jawaban ke dokumen yang dibaca PESERTA. Selama
// snapshot itu ada, memindahkan kunci di Question Bank saja tidak cukup.
//
// Dijalankan lewat `npm run test:units`.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoKeyFieldsInEntry,
  assertSubQuestionsHaveNoKeys,
  buildSnapshotV3Entry,
  isLegacySnapshotEntry,
  keyFieldsOfLegacyEntry,
  legacyEntriesWithKeys
} from '../src/features/quizzes/utils/snapshotV3.js';
import { splitQuestionData } from '../src/features/questions/utils/questionKeySplit.js';

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

/** Dokumen soal SETELAH M1: hasil split public, sudah tidak memuat kunci. */
const PUBLIC_DOCS = {
  single: { type: 'single', prompt: 'P', points: 10, options: ['a', 'b'] },
  multiple: { type: 'multiple', prompt: 'P', points: 10, options: ['a', 'b', 'c'] },
  boolean: { type: 'boolean', prompt: 'P', points: 10 },
  short_answer: { type: 'short_answer', prompt: 'P', points: 10 },
  essay: { type: 'essay', prompt: 'P', points: 10 },
  matching: { type: 'matching', prompt: 'P', points: 10, matchLeft: ['a', 'b'], matchRight: ['x', 'y'] },
  ordering: { type: 'ordering', prompt: 'P', points: 10, orderItems: ['satu', 'dua'] },
  numerical: { type: 'numerical', prompt: 'P', points: 10 },
  code: { type: 'code', prompt: 'P', points: 10, starterCode: 'kode awal' },
  case_study: {
    type: 'case_study',
    prompt: 'P',
    points: 10,
    caseText: 'kasus',
    subQuestions: [{ type: 'single', options: ['a', 'b'] }]
  }
};

/** Dokumen soal SEBELUM M1: masih memuat kunci inline. */
const LEGACY_DOCS = {
  single: { type: 'single', prompt: 'P', points: 5, options: ['a', 'b'], answerIndex: 1 },
  multiple: { type: 'multiple', prompt: 'P', points: 5, options: ['a', 'b', 'c'], correctIndices: [0, 2] },
  boolean: { type: 'boolean', prompt: 'P', points: 5, correctBoolean: true },
  short_answer: { type: 'short_answer', prompt: 'P', points: 5, acceptedAnswers: ['x'] },
  essay: { type: 'essay', prompt: 'P', points: 5, sampleAnswer: 'kuncinya' },
  matching: { type: 'matching', prompt: 'P', points: 5, pairs: [{ left: 'a', right: 'y' }] },
  ordering: { type: 'ordering', prompt: 'P', points: 5, items: ['satu', 'dua'] },
  numerical: { type: 'numerical', prompt: 'P', points: 5, correctValue: 42, tolerance: 0.1 },
  code: { type: 'code', prompt: 'P', points: 5, starterCode: 'x', expectedOutput: '2', sampleSolution: 'sol' },
  case_study: {
    type: 'case_study',
    prompt: 'P',
    points: 5,
    caseText: 'kasus',
    subQuestions: [{ type: 'single', options: ['a', 'b'], answerIndex: 1 }]
  }
};

// ---------- 1. v3 tidak pernah membawa kunci ----------

test('SNAPSHOT v3: 10 tipe — entri bebas dari semua field kunci', () => {
  for (const type of TYPES) {
    const entry = buildSnapshotV3Entry(PUBLIC_DOCS[type], `q-${type}`, 3);
    for (const f of [
      'answerIndex',
      'correctIndices',
      'correctBoolean',
      'acceptedAnswers',
      'sampleAnswer',
      'pairs',
      'items',
      'correctValue',
      'tolerance',
      'expectedOutput',
      'sampleSolution'
    ]) {
      assert.equal(f in entry, false, `${type}: snapshot bocor ${f}`);
    }
  }
});

test('SNAPSHOT v3: menolak dokumen publik yang ternyata masih berkey', () => {
  // Kalau ada jalur lain yang menulis kunci ke dokumen publik, lebih baik build
  // gagal sekarang daripada mengirim kunci ke peserta.
  for (const type of TYPES) {
    assert.throws(
      () => buildSnapshotV3Entry(LEGACY_DOCS[type], `q-${type}`, 1),
      /tidak boleh memuat field kunci/,
      `${type}: seharusnya ditolak`
    );
  }
});

test('SNAPSHOT v3: tidak pernah menyertakan `explanation`', () => {
  for (const type of TYPES) {
    const doc = { ...PUBLIC_DOCS[type], explanation: 'pilih yang berlawanan dengan petunjuk' };
    // `explanation` bukan field kunci, jadi build tetap jalan — tapi tidak
    // boleh ikut ter_copy ke entri.
    const entry = buildSnapshotV3Entry(doc, 'q', 1);
    assert.equal('explanation' in entry, false, `${type}: explanation ikut terkirim`);
  }
});

test('SNAPSHOT v3: tidak pernah menyertakan `pairDraft`', () => {
  const doc = { ...PUBLIC_DOCS.matching, pairDraft: [{ left: 'a', right: 'x' }] };
  const entry = buildSnapshotV3Entry(doc, 'q', 1);
  assert.equal('pairDraft' in entry, false);
});

// ---------- 2. Entri tetap CUKUP untuk menjawab ----------

test('SNAPSHOT v3: single/multiple membawa opsi', () => {
  const s = buildSnapshotV3Entry(PUBLIC_DOCS.single, 'q', 1);
  assert.deepEqual(s.options, ['a', 'b']);
  const m = buildSnapshotV3Entry(PUBLIC_DOCS.multiple, 'q', 1);
  assert.deepEqual(m.options, ['a', 'b', 'c']);
});

test('SNAPSHOT v3: code membawa starterCode, dan expectedOutput ditolak', () => {
  // `starterCode` = kode awal yang diedit peserta → aman ikut.
  const ok = buildSnapshotV3Entry(PUBLIC_DOCS.code, 'q', 1);
  assert.equal(ok.starterCode, 'kode awal');
  assert.equal('expectedOutput' in ok, false);
  // `expectedOutput` = kunci. Kalau masih nempel di dokumen soal, build gagal.
  assert.throws(
    () => buildSnapshotV3Entry({ ...PUBLIC_DOCS.code, expectedOutput: '2' }, 'q', 1),
    /expectedOutput/
  );
});

test('SNAPSHOT v3: matching membawa kolam kandidat, TANPA pasangan', () => {
  const entry = buildSnapshotV3Entry(PUBLIC_DOCS.matching, 'q', 1);
  assert.deepEqual(entry.matchLeft, ['a', 'b']);
  assert.deepEqual(entry.matchRight, ['x', 'y']);
  assert.equal('pairs' in entry, false, 'pasangan adalah kunci');
});

test('SNAPSHOT v3: ordering membawa himpunan item, TANPA urutan kunci', () => {
  const entry = buildSnapshotV3Entry(PUBLIC_DOCS.ordering, 'q', 1);
  assert.deepEqual([...entry.orderItems].sort(), ['dua', 'satu']);
  assert.equal('items' in entry, false, 'urutan benar adalah kunci');
});

test('SNAPSHOT v3: dokumen matching/ordering yang belum termigrasi DITOLAK', () => {
  // `pairs`/`items` inline = migrasi M1 belum tuntas.lebih baik gagal di depan
  // daripada mengirim soal tanpa kolam kandidat ATAU tanpa himpunan item yang
  // server pun tidak punya kuncinya.
  assert.throws(
    () => buildSnapshotV3Entry(LEGACY_DOCS.matching, 'q', 1),
    /tidak boleh memuat field kunci/
  );
  assert.throws(
    () => buildSnapshotV3Entry(LEGACY_DOCS.ordering, 'q', 1),
    /tidak boleh memuat field kunci/
  );
});

test('SNAPSHOT v3: pesan guard menyebut id soal & jalur kunci yang belum ada', () => {
  // Pesan harus bisa langsung ditindaklanjuti saat migrasi gagal.
  assert.throws(
    () => buildSnapshotV3Entry(LEGACY_DOCS.numerical, 'soal-abc', 1),
    /questions\/soal-abc\/key/
  );
});

test('SNAPSHOT v3: studi kasus membawa caseText + sub-soal publik', () => {
  const entry = buildSnapshotV3Entry(PUBLIC_DOCS.case_study, 'q', 1);
  assert.equal(entry.caseText, 'kasus');
  assert.deepEqual(entry.subQuestions, [{ type: 'single', options: ['a', 'b'] }]);
});

test('SNAPSHOT v3: sub-soal matching/ordering tetap bisa dijawab', () => {
  const doc = splitQuestionData(
    'case_study',
    {
      type: 'case_study',
      prompt: 'p',
      points: 10,
      caseText: 'k',
      subQuestions: [
        { type: 'matching', pairs: [{ left: 'a', right: 'x' }, { left: 'b', right: 'y' }] },
        { type: 'ordering', items: ['p', 'q', 'r'] }
      ]
    },
    'q'
  ).public;
  const entry = buildSnapshotV3Entry(doc, 'q', 1);
  assert.equal(entry.subQuestions[0].matchLeft.length, 2);
  assert.equal(entry.subQuestions[0].matchRight.length, 2);
  assert.equal(entry.subQuestions[1].orderItems.length, 3);
  assert.equal('pairs' in entry.subQuestions[0], false);
  assert.equal('items' in entry.subQuestions[1], false);
});

// ---------- 3. Field wajib & normalisasi ----------

test('SNAPSHOT v3: selalu punya id, type, prompt, points, keyRevision', () => {
  for (const type of TYPES) {
    const e = buildSnapshotV3Entry(PUBLIC_DOCS[type], `q-${type}`, 5);
    assert.equal(e.id, `q-${type}`);
    assert.equal(e.type, type);
    assert.equal(typeof e.prompt, 'string');
    assert.equal(typeof e.points, 'number');
    assert.equal(e.keyRevision, '5');
  }
});

test('SNAPSHOT v3: keyRevision selalu string (urutan stabil)', () => {
  assert.equal(buildSnapshotV3Entry(PUBLIC_DOCS.boolean, 'q', 7).keyRevision, '7');
  assert.equal(buildSnapshotV3Entry(PUBLIC_DOCS.boolean, 'q', '12').keyRevision, '12');
});

test('SNAPSHOT v3: points default 10 bila tidak valid', () => {
  assert.equal(buildSnapshotV3Entry({ type: 'boolean', prompt: 'p' }, 'q', 1).points, 10);
  assert.equal(buildSnapshotV3Entry({ type: 'boolean', prompt: 'p', points: 0 }, 'q', 1).points, 10);
  assert.equal(buildSnapshotV3Entry({ type: 'boolean', prompt: 'p', points: -5 }, 'q', 1).points, 10);
  assert.equal(buildSnapshotV3Entry({ type: 'boolean', prompt: 'p', points: 25 }, 'q', 1).points, 25);
  assert.equal(buildSnapshotV3Entry({ type: 'boolean', prompt: 'p', points: 'abc' }, 'q', 1).points, 10);
});

test('SNAPSHOT v3: id dari dokumen dipakai kalau ada (irtama dengan argumen)', () => {
  assert.equal(buildSnapshotV3Entry({ ...PUBLIC_DOCS.boolean, id: 'dari-dokumen' }, 'q-arg', 1).id, 'dari-dokumen');
});

test('SNAPSHOT v3: soal tidak tersedia → bentuk `unavailable` (0 poin, bukan kunci)', () => {
  for (const arg of [null, undefined, { available: false }]) {
    const e = buildSnapshotV3Entry(arg, 'gone', 1);
    assert.equal(e.id, 'gone');
    assert.equal(e.type, 'unavailable');
    assert.equal(e.points, 0);
    assert.equal(e.available, false);
  }
});

// ---------- 4. Guard langsung ----------

test('SNAPSHOT guard: menolak kunci / explanation / pairDraft', () => {
  assert.throws(() => assertNoKeyFieldsInEntry({ answerIndex: 1 }), /field kunci/);
  assert.throws(() => assertNoKeyFieldsInEntry({ explanation: 'bocor' }), /explanation/);
  assert.throws(() => assertNoKeyFieldsInEntry({ pairDraft: {} }), /pairDraft/);
  assert.throws(
    () => assertNoKeyFieldsInEntry({ subQuestions: [{ type: 'single', answerIndex: 0 }] }),
    /sub-soal/
  );
  assert.doesNotThrow(() =>
    assertNoKeyFieldsInEntry({ type: 'single', prompt: 'p', points: 1, options: ['a'] })
  );
});

test('SNAPSHOT guard: assertSubQuestionsHaveNoKeys menunjuk sub-soal yang salah', () => {
  assert.throws(
    () => assertSubQuestionsHaveNoKeys([{ type: 'single', options: ['a'] }, { type: 'boolean', correctBoolean: true }]),
    /Sub-soal #2/
  );
  assert.throws(
    () => assertSubQuestionsHaveNoKeys([{ type: 'ordering', items: ['a', 'b'] }]),
    /Sub-soal #1/
  );
  assert.doesNotThrow(() => assertSubQuestionsHaveNoKeys([{ type: 'single', options: ['a'] }]));
  assert.doesNotThrow(() => assertSubQuestionsHaveNoKeys(null));
  assert.doesNotThrow(() => assertSubQuestionsHaveNoKeys([]));
});

// ---------- 5. Kompatibilitas v2 (read-only, tidak pernah ditulis lagi) ----------

test('SNAPSHOT v2: entri legacy terdeteksi untuk review', () => {
  for (const type of TYPES) {
    assert.equal(isLegacySnapshotEntry(LEGACY_DOCS[type]), true, `${type} tidak terdeteksi legacy`);
    assert.equal(isLegacySnapshotEntry(PUBLIC_DOCS[type]), false, `${type} salah terdeteksi legacy`);
  }
  assert.equal(isLegacySnapshotEntry(null), false);
});

test('SNAPSHOT v2: legacyEntriesWithKeys menyaring hanya entri berkey', () => {
  const snap = [
    { id: 'a', ...LEGACY_DOCS.single },
    { id: 'b', ...PUBLIC_DOCS.single },
    { id: 'c', ...LEGACY_DOCS.numerical }
  ];
  const found = legacyEntriesWithKeys(snap);
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((e) => e.id), ['a', 'c']);
  assert.deepEqual(legacyEntriesWithKeys(null), []);
});

test('SNAPSHOT v2: keyFieldsOfLegacyEntry melaporkan kunci yang terbaca', () => {
  const keys = keyFieldsOfLegacyEntry(LEGACY_DOCS.numerical);
  assert.equal(keys.correctValue, 42);
  assert.equal(keys.tolerance, 0.1);
  assert.deepEqual(keyFieldsOfLegacyEntry(null), {});
  assert.deepEqual(keyFieldsOfLegacyEntry({ type: 'single', prompt: 'p' }), {});
});

// ---------- 6. Invarian utama: split → snapshot tetap bersih ----------

test('SNAPSHOT v3: untuk tiap tipe, hasil split M1 → snapshot bebas kunci', () => {
  const raw = {
    single: { type: 'single', prompt: 'p', points: 5, options: ['a', 'b'], answerIndex: 1 },
    multiple: { type: 'multiple', prompt: 'p', points: 5, options: ['a', 'b'], correctIndices: [0] },
    boolean: { type: 'boolean', prompt: 'p', points: 5, correctBoolean: true },
    short_answer: { type: 'short_answer', prompt: 'p', points: 5, acceptedAnswers: ['x'] },
    essay: { type: 'essay', prompt: 'p', points: 5, sampleAnswer: 'k' },
    matching: {
      type: 'matching',
      prompt: 'p',
      points: 5,
      pairs: [{ left: 'a', right: 'x' }, { left: 'b', right: 'y' }]
    },
    ordering: { type: 'ordering', prompt: 'p', points: 5, items: ['s', 'd', 't'] },
    numerical: { type: 'numerical', prompt: 'p', points: 5, correctValue: 3, tolerance: 0 },
    code: { type: 'code', prompt: 'p', points: 5, starterCode: 'a', expectedOutput: '2', sampleSolution: 's' },
    case_study: {
      type: 'case_study',
      prompt: 'p',
      points: 5,
      caseText: 'k',
      subQuestions: [{ type: 'single', options: ['a', 'b'], answerIndex: 1 }]
    }
  };
  for (const type of TYPES) {
    const { public: doc } = splitQuestionData(type, raw[type], `q-${type}`);
    const entry = buildSnapshotV3Entry(doc, `q-${type}`, 1);
    // `buildSnapshotV3Entry` sudah memanggil guard; panggil lagi eksplisit
    // supaya kegagalan terlihat di test ini, bukan diam-diam tertangkap di
    // dalam build.
    assert.doesNotThrow(() => assertNoKeyFieldsInEntry(entry), `${type}: bocor`);
    assert.equal('explanation' in entry, false);
    assert.equal('pairDraft' in entry, false);
  }
});

test('SNAPSHOT v3: 500 entri acak — kunci milik tipe sendiri selalu tertangkap', () => {
  const rnd = (() => {
    let s = 12345;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();
  // Yang realistis bocor adalah field kunci yang DIMILIKI tipe itu sendiri
  // (mis. `numerical` yang masih punya `correctValue`). Field kunci milik tipe
  // lain/dibuang oleh whitelist build saat build, jadi bukan skenario bocor.
  const keyFieldsByType = {
    single: ['answerIndex'],
    multiple: ['correctIndices'],
    boolean: ['correctBoolean'],
    short_answer: ['acceptedAnswers'],
    essay: ['sampleAnswer'],
    matching: ['pairs'],
    ordering: ['items'],
    numerical: ['correctValue', 'tolerance'],
    code: ['expectedOutput', 'sampleSolution'],
    case_study: []
  };
  const values = {
    pairs: [{ left: 'a', right: 'x' }],
    items: ['x', 'y'],
    correctIndices: [0, 2]
  };
  for (let i = 0; i < 500; i += 1) {
    const type = TYPES[i % TYPES.length];
    const doc = { type, prompt: `p${i}`, points: 10 };
    if (type === 'single' || type === 'multiple') doc.options = ['a', 'b', 'c'];
    if (type === 'case_study') {
      // Kunci di dalam sub-soal harus tertangkap.
      doc.caseText = 'k';
      doc.subQuestions = [
        { type: 'single', options: ['a', 'b'], answerIndex: Math.floor(rnd() * 2) }
      ];
      assert.throws(
        () => buildSnapshotV3Entry(doc, `q${i}`, 1),
        /Sub-soal #1/,
        `entri ${i} (case_study) lolos dari guard sub-soal`
      );
      continue;
    }
    const candidates = keyFieldsByType[type];
    const leak = candidates[Math.floor(rnd() * candidates.length)];
    doc[leak] = leak in values ? values[leak] : 'x';
    assert.throws(
      () => buildSnapshotV3Entry(doc, `q${i}`, 1),
      /tidak boleh memuat field kunci/,
      `entri ${i} (${type}, leak=${leak}) lolos dari guard`
    );
  }
});

test('SNAPSHOT v3: field kunci milik tipe lain DITOLAK (kebocoran lintas-tipe dicegat)', () => {
  // `correctValue` bukan field kunci `single`, tapi keberadaannya di dokumen
  // soal berarti ada data kunci nyasar. Itu tetapLAH kebocoran: ditolak, bukan
  // dibuang diam-diam.
  assert.throws(
    () => buildSnapshotV3Entry({ type: 'single', prompt: 'p', points: 10, options: ['a'], correctValue: 42 }, 'q', 1),
    /tidak boleh memuat field kunci/
  );
});
