import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ALL_TYPE_FIELDS,
  applyTypeChange,
  checkQuestionComplete,
  emptyQuestionDraft,
  hasDataForType,
  normalizeSubQuestions,
  questionPayloadKey,
  TYPE_FIELDS
} from '../src/features/quizzes/utils/questionCard.js';
import { buildTypeFields, MAX_SUB_QUESTIONS, SUB_QUESTION_TYPES } from '../src/features/questions/utils/questionTypeFields.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Draft valid per tipe — titik awal untuk tes ganti-tipe.
const validFor = (type, extra = {}) => ({ ...emptyQuestionDraft('t1', type), prompt: 'P?', ...extra });

describe('emptyQuestionDraft', () => {
  it('default Pilihan Ganda dengan dua opsi kosong, dan BELUM lengkap', () => {
    const d = emptyQuestionDraft('t1');
    assert.equal(d.type, 'single');
    assert.equal(d.topicId, 't1');
    assert.deepEqual(d.options, ['', '']);
    const c = checkQuestionComplete(d);
    assert.equal(c.ok, false, 'draft kosong tidak boleh lolos simpan');
    assert.match(c.error, /Tulis pertanyaan dulu/);
  });

  it('prompt ada tapi opsi kosong tetap belum lengkap', () => {
    const c = checkQuestionComplete({ ...emptyQuestionDraft('t1'), prompt: 'Apa 1+1?' });
    assert.equal(c.ok, false);
    assert.match(c.error, /opsi/i);
  });
});

describe('checkQuestionComplete', () => {
  it('Pilihan Ganda lengkap → ok', () => {
    const c = checkQuestionComplete({
      ...emptyQuestionDraft('t1'),
      prompt: '1+1?',
      options: ['1', '2'],
      answerIndex: 1
    });
    assert.deepEqual(c, { ok: true });
  });

  it('multi-select butuh minimal satu correctIndices', () => {
    const base = { ...emptyQuestionDraft('t1', 'multiple'), prompt: 'p', options: ['a', 'b'] };
    assert.equal(checkQuestionComplete({ ...base, correctIndices: [] }).ok, false);
    assert.equal(checkQuestionComplete({ ...base, correctIndices: [0] }).ok, true);
  });

  it('multi-select butuh minimal satu pengecoh (K < N)', () => {
    // Kartu inline menyimpan lewat `checkQuestionComplete`, jadi authoring
    // inline otomatis ikut aturan yang sama dengan modal & builder.
    const base = { ...emptyQuestionDraft('t1', 'multiple'), prompt: 'p', options: ['a', 'b', 'c'] };
    const semua = checkQuestionComplete({ ...base, correctIndices: [0, 1, 2] });
    assert.equal(semua.ok, false, 'K=N tidak boleh lolos simpan');
    assert.match(semua.error, /pengecoh/);
    assert.equal(checkQuestionComplete({ ...base, correctIndices: [0, 1] }).ok, true);
  });

  it('Benar/Salah, Isian Singkat, Numerik, Uraian bisa lengkap', () => {
    assert.equal(checkQuestionComplete(validFor('boolean')).ok, true);
    assert.equal(checkQuestionComplete({ ...validFor('short_answer'), acceptedAnswers: ['ya'] }).ok, true);
    assert.equal(checkQuestionComplete({ ...validFor('numerical'), correctValue: '3' }).ok, true);
    assert.equal(checkQuestionComplete(validFor('essay')).ok, true, 'uraian boleh tanpa kunci');
  });

  it('Matching butuh 2 pasangan, Ordering butuh 2 item', () => {
    assert.equal(checkQuestionComplete({ ...validFor('matching'), pairs: [{ left: 'a', right: 'b' }] }).ok, false);
    assert.equal(checkQuestionComplete({
      ...validFor('matching'),
      pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }]
    }).ok, true);
    assert.equal(checkQuestionComplete({ ...validFor('ordering'), items: ['x'] }).ok, false);
  });

  it('Studi Kasus butuh caseText', () => {
    assert.equal(checkQuestionComplete({ ...validFor('case_study'), caseText: '' }).ok, false);
    assert.equal(checkQuestionComplete({ ...validFor('case_study'), caseText: 'Kasus' }).ok, true);
  });

  it('Soal Kode boleh kosong (dinilai manual)', () => {
    assert.equal(checkQuestionComplete(validFor('code')).ok, true);
  });

  it('tidak ada topik → belum lengkap', () => {
    const c = checkQuestionComplete({ ...emptyQuestionDraft(''), prompt: 'p', options: ['a', 'b'] });
    assert.equal(c.ok, false);
    assert.match(c.error, /topik/i);
  });
});

describe('hasDataForType — konfirmasi ganti tipe', () => {
  it('draft kosong tidak memicu konfirmasi (default 0 bukan "data")', () => {
    assert.equal(hasDataForType('single', emptyQuestionDraft('t1'), 'essay'), false);
    assert.equal(hasDataForType('boolean', emptyQuestionDraft('t1', 'boolean'), 'essay'), false);
  });

  it('opsi terisi memicu konfirmasi', () => {
    const d = { ...emptyQuestionDraft('t1'), prompt: 'p', options: ['1', '2'], answerIndex: 1 };
    assert.equal(hasDataForType('single', d, 'short_answer'), true);
  });

  it('acceptedAnswers terisi memicu konfirmasi', () => {
    assert.equal(hasDataForType('short_answer', { ...validFor('short_answer'), acceptedAnswers: ['ya'] }, 'essay'), true);
  });

  it('tipe sama tidak pernah memicu konfirmasi', () => {
    const d = { ...emptyQuestionDraft('t1'), prompt: 'p', options: ['1', '2'] };
    assert.equal(hasDataForType('single', d, 'single'), false);
  });
});

describe('applyTypeChange — field tipe lama dibuang, yang baru di-default', () => {
  it('ganti single → short_answer membuang options/answerIndex', () => {
    const d = { ...emptyQuestionDraft('t1'), prompt: 'p', options: ['1', '2'], answerIndex: 1 };
    const n = applyTypeChange(d, 'short_answer');
    assert.equal('options' in n, false);
    assert.equal('answerIndex' in n, false);
    assert.equal('correctIndices' in n, false);
    assert.deepEqual(n.acceptedAnswers, [], 'field baru diinisialisasi kosong');
  });

  it('field umum tetap utuh (prompt, topic, tags, points, explanation)', () => {
    const d = {
      ...emptyQuestionDraft('t1'),
      prompt: 'Pertanyaan penting',
      points: 25,
      explanation: 'Pembahasan',
      tags: ['aljabar'],
      difficulty: 'advanced',
      options: ['1', '2'],
      answerIndex: 1
    };
    const n = applyTypeChange(d, 'numerical');
    assert.equal(n.prompt, 'Pertanyaan penting');
    assert.equal(n.points, 25);
    assert.equal(n.explanation, 'Pembahasan');
    assert.deepEqual(n.tags, ['aljabar']);
    assert.equal(n.difficulty, 'advanced');
    assert.equal(n.topicId, 't1');
    assert.equal(n.type, 'numerical');
  });

  it('ganti ke case_study hanya menyisakan field miliknya', () => {
    const d = {
      ...validFor('matching'),
      pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }]
    };
    const n = applyTypeChange(d, 'case_study');
    assert.equal('pairs' in n, false);
    assert.equal('caseText' in n, true);
    assert.deepEqual(n.subQuestions, []);
  });

  it('tidak ada field yatim di TYPE_FIELDS', () => {
    for (const [type, fields] of Object.entries(TYPE_FIELDS)) {
      for (const f of fields) {
        assert.ok(ALL_TYPE_FIELDS.includes(f), `${type}.${f} harus terdaftar di ALL_TYPE_FIELDS`);
      }
    }
  });
});

describe('questionPayloadKey — dedupe autosave', () => {
  it('draft identik menghasilkan kunci sama', () => {
    assert.equal(questionPayloadKey(validFor('boolean')), questionPayloadKey(validFor('boolean')));
  });

  it('perubahan isi mengubah kunci', () => {
    const a = validFor('boolean');
    assert.notEqual(questionPayloadKey(a), questionPayloadKey({ ...a, prompt: 'beda' }));
  });

  it('field yang TIDAK dimiliki tipe tidak memengaruhi kunci', () => {
    // Sisa field dari tipe sebelumnya tidak boleh memicu write ulang.
    const a = { ...validFor('boolean'), options: ['x'] };
    const b = { ...validFor('boolean'), options: ['y'] };
    assert.equal(questionPayloadKey(a), questionPayloadKey(b));
  });

  it('urutan tag tidak memengaruhi kunci', () => {
    const a = { ...validFor('boolean'), tags: ['a', 'b'] };
    const b = { ...validFor('boolean'), tags: ['b', 'a'] };
    assert.equal(questionPayloadKey(a), questionPayloadKey(b));
  });

  it('draft kosong tetap punya kunci (tidak null)', () => {
    assert.equal(typeof questionPayloadKey(emptyQuestionDraft('t')), 'string');
  });
});

// ---------------------------------------------------------------------------
// AUTOSAVE MATCHING dengan `pairDraft`.
// Risiko utama: `pairs` tidak berubah (mis. masih 2 pasangan lengkap) padahal
// draft editor berubah -> `questionPayloadKey` thinksama -> autosave berhenti
// dan perubahan hilang.
// ---------------------------------------------------------------------------
describe('matching draft - autosave tidak boleh kehilangan perubahan', () => {
  const TWO_PAIRS = [
    { left: 'Indonesia', right: 'Jakarta' },
    { left: 'Prancis', right: 'Paris' }
  ];
  const DRAFT_ALL = { lefts: ['Indonesia', 'Jepang', 'Prancis'], rights: ['Jakarta', 'Tokyo', 'Paris'], assigned: [0, 1, 2] };
  const DRAFT_UNPAIRED = { ...DRAFT_ALL, assigned: [0, null, 2] };

  it('"Lepas pasangan" mengubah kunci walau pairs masih >= 2 pasangan', () => {
    const before = { ...validFor('matching'), pairs: TWO_PAIRS, pairDraft: DRAFT_ALL };
    const after = { ...validFor('matching'), pairs: TWO_PAIRS, pairDraft: DRAFT_UNPAIRED };
    assert.deepEqual(before.pairs, after.pairs, 'answer key sengaja tidak berubah');
    assert.notEqual(
      questionPayloadKey(before),
      questionPayloadKey(after),
      'draft berubah harus memicu autosave'
    );
  });

  it('mengedit teks baris belum dipasangkan mengubah kunci', () => {
    const before = { ...validFor('matching'), pairs: TWO_PAIRS, pairDraft: DRAFT_UNPAIRED };
    const after = {
      ...validFor('matching'),
      pairs: TWO_PAIRS,
      pairDraft: { ...DRAFT_UNPAIRED, lefts: ['Indonesia', 'Jepang Baru', 'Prancis'] }
    };
    assert.notEqual(questionPayloadKey(before), questionPayloadKey(after));
  });

  it('draft identik tetap menghasilkan kunci sama (tidak write berulang)', () => {
    const a = { ...validFor('matching'), pairs: TWO_PAIRS, pairDraft: DRAFT_UNPAIRED };
    assert.equal(questionPayloadKey(a), questionPayloadKey({ ...a }));
  });

  it('baris belum dipasangkan TIDAK memblokir autosave selama answer key >= 2', () => {
    const draft = { ...validFor('matching'), pairs: TWO_PAIRS, pairDraft: DRAFT_UNPAIRED };
    assert.deepEqual(
      checkQuestionComplete(draft),
      { ok: true },
      'satu baris belum dipasangkan tidak boleh menghentikan penyimpanan draft'
    );
  });

  it('answer key < 2 pasangan tetap ditolak (syarat attempt tidak berubah)', () => {
    const draft = {
      ...validFor('matching'),
      pairs: [{ left: 'Indonesia', right: 'Jakarta' }],
      pairDraft: { lefts: ['Indonesia', 'Jepang'], rights: ['Jakarta', 'Tokyo'], assigned: [0, null] }
    };
    const c = checkQuestionComplete(draft);
    assert.equal(c.ok, false);
    assert.match(c.error, /2 pasangan/i);
  });

  it('ganti tipe keluar dari matching membuang pairDraft', () => {
    const draft = { ...validFor('matching'), pairs: TWO_PAIRS, pairDraft: DRAFT_UNPAIRED };
    const next = applyTypeChange(draft, 'ordering');
    assert.equal('pairDraft' in next, false, 'draft editor tidak boleh ikut ke tipe lain');
    assert.equal('pairs' in next, false);
  });

  it('buildTypeFields menyertakan pairDraft hanya kalau strukturnya valid', () => {
    const withDraft = buildTypeFields('matching', { pairs: TWO_PAIRS, pairDraft: DRAFT_UNPAIRED });
    assert.deepEqual(withDraft.pairDraft, DRAFT_UNPAIRED);
    // Soal lama: tidak ada draft -> tidak ada field baru sama sekali
    assert.equal('pairDraft' in buildTypeFields('matching', { pairs: TWO_PAIRS }), false);
    // Draft rusak -> dibuang, bukan ditulis apa adanya
    assert.equal('pairDraft' in buildTypeFields('matching', { pairs: TWO_PAIRS, pairDraft: { x: 1 } }), false);
    // Draft null -> tidak ada field (backward compatible)
    assert.equal('pairDraft' in buildTypeFields('matching', { pairs: TWO_PAIRS, pairDraft: null }), false);
  });

  it('buildTypeFields tetap menolak answer key < 2 walau draft-nya valid', () => {
    assert.throws(
      () => buildTypeFields('matching', { pairs: [{ left: 'a', right: 'b' }], pairDraft: DRAFT_UNPAIRED }),
      /2 pasangan/i
    );
  });
});

describe('batasan sub-soal studi kasus (dijaga rules, bukan UI)', () => {
  it('SUB_QUESTION_TYPES tidak memuat essay/code/case_study', () => {
    // `firestore.rules` validCaseStudy menolak tipe di luar daftar ini.
    assert.equal(SUB_QUESTION_TYPES.includes('essay'), false);
    assert.equal(SUB_QUESTION_TYPES.includes('code'), false);
    assert.equal(SUB_QUESTION_TYPES.includes('case_study'), false);
    assert.equal(SUB_QUESTION_TYPES.length, 7);
  });

  it('SUB_QUESTION_TYPES PERSIS sama dengan daftar di firestore.rules', () => {
    // Rules adalah source of truth. Tes ini membaca `validCaseStudy` langsung
    // supaya daftar di client tidak bisa diam-diam melebar: autosave harus
    // menghasilkan dokumen yang diterima server.
    //
    // CATATAN SPESIFIKASI: brief aslinya menyebut "tipe 1-9" untuk sub-soal.
    // Implementation rules hanya mengizinkan 7 tipe di atas (lihat
    // KNOWN-LIMITATION di docs/PROGRESS.md); daftar itu yang dipakai.
    const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
    // Anchor-nya `validPublicSubQuestion`, bukan `validCaseStudy`: saat rewrite
    // rules, `validCaseStudy` cuma memvalidasi amplop studi kasus dan
    // mendelegasikan tiap elemen ke `validPublicSubQuestion`. Menambatkan
    // tes ke `validCaseStudy` membuat tes ini diam-diam membaca daftar tipe
    // yang salah begitu ada `in [` lain di dalam fungsi itu - dan karena
    // `assert.deepEqual(fromRules, [...])` sudah gagal duluan, yang terlihat
    // hanyalah "rules berubah", tanpa tahu daftar mana yang sebenarnya hilang.
    // Fungsi inilah yang memegang daftar 7 tipe, jadi ke sini.
    const anchor = 'function validPublicSubQuestion(';
    assert.ok(rules.includes(anchor), `firestore.rules harus punya ${anchor}`);
    const fn = rules.slice(rules.indexOf(anchor));
    // Daftar tipe ada di `s.type in [ ... ]` — pakai penanda `type in [` supaya
    // tidak tertangkap `[0]` (indeks list) maupun daftar `in [` lain di fungsi.
    const start = fn.indexOf('type in [') + 'type '.length;
    const list = fn.slice(start, fn.indexOf(']', start) + 1);
    const fromRules = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    assert.deepEqual(fromRules, [
      'single',
      'multiple',
      'boolean',
      'short_answer',
      'matching',
      'ordering',
      'numerical'
    ]);
    assert.deepEqual(SUB_QUESTION_TYPES, fromRules, 'client harus mengikuti rules, bukan sebaliknya');
  });

  it('batas sub-soal sesuai rules', () => {
    assert.equal(MAX_SUB_QUESTIONS, 10);
  });

  it('studi kasus dengan 2 sub-soal berbeda bisa lengkap', () => {
    const d = {
      ...emptyQuestionDraft('t1', 'case_study'),
      prompt: 'Analisis kasus',
      caseText: 'Kasus lengkap',
      subQuestions: [
        { type: 'single', options: ['a', 'b'], answerIndex: 0 },
        { type: 'numerical', correctValue: 5, tolerance: 1 }
      ]
    };
    assert.deepEqual(checkQuestionComplete(d), { ok: true });
  });

  it('sub-soal bertipe essay ditolak SEBELUM write (client)', () => {
    // Normalizer yang dipakai `updateQuestion` melempar, jadi rules tidak
    // pernah menolak lewat error server — user dapat pesan ramah di kartu.
    assert.throws(
      () => normalizeSubQuestions([{ type: 'essay', sampleAnswer: 'apa saja' }]),
      /tipe/i
    );
  });
});
