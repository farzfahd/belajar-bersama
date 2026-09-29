// ============================================================================
// MELIHAT SOAL BESERTA KUNCINYA (Assessment Security, client integration).
// ============================================================================
//
// `keyView.js` menyatukan dua dokumen menjadi satu objek tampilan: dokumen soal
// publik dan dokumen kunci privat. Kegagalan di sini tidak selalu terlihat
// sebagai "kunci tidak terbaca" — kalau salah, form edit bisa menampilkan
// kunci soal yang salah, atau membiarkan kunci lama hilang.
//
// Dijalankan lewat `npm run test:units`.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeKeyIntoQuestion,
  mergeSubQuestionKey
} from '../src/features/questions/utils/keyView.js';
import { splitQuestionData } from '../src/features/questions/utils/questionKeySplit.js';

// ---------- 1. Penolakan field yang bukan milik tipe ----------

test('KEYVIEW: hanya field kunci milik tipenya yang diambil', () => {
  const question = { type: 'single', prompt: 'p', options: ['a', 'b'], points: 10 };
  const key = { keyRevision: '2', type: 'single', answerIndex: 1, createdAt: { s: 1 }, schemaVersion: 1 };
  const view = mergeKeyIntoQuestion(question, key);
  assert.equal(view.answerIndex, 1);
  // `correctValue` bukan kunci `single`. Kalau ikut terbawa, itu kebocoran
  // lintas-tipe — jenis data yang tidak akan terlihat di UI tapi tetap keluar
  // ke layar begitu dasarnya salah.
  assert.equal('correctValue' in view, false);
  assert.equal('pairs' in view, false);
});

test('KEYVIEW: metadata dokumen kunci TIDAK menimpa metadata soal', () => {
  // Dokumen kunci membawa `createdAt`/`schemaVersion`/`keyRevision` milik
  // dirinya sendiri. Menyalin semuanya akan membuat `createdAt` soal ikut
  // berubah hanya karena panel detail dibuka — dan tidak bisa dikembalikan.
  const createdAt = { seconds: 100 };
  const question = { type: 'boolean', prompt: 'p', createdAt, schemaVersion: 1 };
  const key = { keyRevision: '3', type: 'boolean', correctBoolean: false, createdAt: { seconds: 999 }, schemaVersion: 7 };
  const view = mergeKeyIntoQuestion(question, key);
  assert.equal(view.correctBoolean, false);
  assert.equal(view.createdAt, createdAt, 'createdAt soal harus tetap');
  assert.equal(view.schemaVersion, 1, 'schemaVersion soal harus tetap');
});

test('KEYVIEW: kunci `null` dianggap tidak ada (Firestore null = hapus field)', () => {
  const question = { type: 'numerical', prompt: 'p', correctValue: 5, tolerance: 1 };
  const view = mergeKeyIntoQuestion(question, { correctValue: null, tolerance: 0.5 });
  assert.equal(view.correctValue, 5, 'null tidak boleh menimpa nilai yang ada');
  assert.equal(view.tolerance, 0.5);
});

// ---------- 2. Tanpa kunci tidak terjadi apa-apa ----------

test('KEYVIEW: tanpa kunci, objek soal dikembalikan apa adanya', () => {
  const question = { type: 'single', prompt: 'p', options: ['a', 'b'] };
  for (const key of [null, undefined, false, 0, '']) {
    assert.equal(mergeKeyIntoQuestion(question, key), question);
  }
  assert.equal(mergeKeyIntoQuestion(null, { answerIndex: 1 }), null);
});

test('KEYVIEW: kunci tanpa field milik tipe tidak mengubah apa pun', () => {
  const question = { type: 'essay', prompt: 'p' };
  const view = mergeKeyIntoQuestion(question, { keyRevision: '2', type: 'essay' });
  assert.deepEqual(view, question);
});

// ---------- 3. Studi kasus: penggabungan per indeks ----------

const CASE_PUBLIC = {
  type: 'case_study',
  prompt: 'p',
  caseText: 'kasus',
  subQuestions: [
    { type: 'single', options: ['a', 'b'] },
    { type: 'boolean' }
  ]
};
const CASE_KEY = {
  keyRevision: '1',
  type: 'case_study',
  subQuestions: [
    { type: 'single', answerIndex: 1 },
    { type: 'boolean', correctBoolean: true }
  ]
};

test('KEYVIEW: studi kasus menggabungkan kunci sub-soal per indeks', () => {
  const view = mergeKeyIntoQuestion(CASE_PUBLIC, CASE_KEY);
  assert.equal(view.subQuestions.length, 2);
  assert.deepEqual(view.subQuestions[0], { type: 'single', options: ['a', 'b'], answerIndex: 1 });
  assert.deepEqual(view.subQuestions[1], { type: 'boolean', correctBoolean: true });
  assert.equal(view.caseText, 'kasus');
});

test('KEYVIEW: material publik sub-soal tidak hilang digabung kunci', () => {
  // Ini regresi yang paling merusak: `subQuestions` dari dokumen kunci hanya
  // berisi field kunci. Mengganti seluruh array akan membuat sub-soal kehilangan
  // opsi — form edit jadi tidak bisa menyimpan jawaban yang sama.
  const view = mergeKeyIntoQuestion(CASE_PUBLIC, CASE_KEY);
  assert.deepEqual(view.subQuestions[0].options, ['a', 'b']);
});

test('KEYVIEW: kunci sub-soal dengan tipe berbeda TIDAK dipinjam', () => {
  // Sub-soal kedua di sisi kunci bertipe `boolean` sementara di sisi publik
  // `single`. Meminjamkan kunci itu akan menempelkan `correctBoolean` ke
  // sub-soal `single` — data yang tidak pernah ada dan tidak bisa dinilai.
  const publicSubs = [{ type: 'single', options: ['a', 'b'] }, { type: 'single', options: ['c', 'd'] }];
  const keySubs = [{ type: 'boolean', correctBoolean: true }, { type: 'single', answerIndex: 1 }];
  const merged = mergeSubQuestionKey(publicSubs, keySubs);
  assert.equal('correctBoolean' in merged[0], false);
  assert.equal('answerIndex' in merged[0], false);
  assert.equal(merged[1].answerIndex, 1);
});

test('KEYVIEW: sub-soal publik tanpa pasangan kunci tetap dipertahankan', () => {
  // Menghapus baris berarti author kehilangan sub-soal tanpa disadari.
  const publicSubs = [{ type: 'single', options: ['a', 'b'] }, { type: 'boolean' }, { type: 'numerical' }];
  const keySubs = [{ type: 'single', answerIndex: 0 }];
  const merged = mergeSubQuestionKey(publicSubs, keySubs);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].answerIndex, 0);
  assert.equal('answerIndex' in merged[1], false);
  assert.equal('answerIndex' in merged[2], false);
});

test('KEYVIEW: mergeSubQuestionKey tahan input rusak', () => {
  for (const input of [null, undefined, 'bukan array', {}]) {
    assert.deepEqual(mergeSubQuestionKey(input, null), []);
  }
  assert.deepEqual(mergeSubQuestionKey([{ type: 'single' }], [null, undefined]), [
    { type: 'single' }
  ]);
});

// ---------- 4. Invarian utama: split -> gabung tidak pernah membocorkan ----

test('KEYVIEW: untuk tiap tipe, split M1 lalu gabung hanya mengembalikan kunci yang ditahan', () => {
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
    numerical: { type: 'numerical', prompt: 'p', points: 5, correctValue: 3, tolerance: 0.5 },
    code: { type: 'code', prompt: 'p', points: 5, starterCode: 'a', expectedOutput: '2', sampleSolution: 's' },
    case_study: {
      type: 'case_study',
      prompt: 'p',
      points: 5,
      caseText: 'k',
      subQuestions: [{ type: 'single', options: ['a', 'b'], answerIndex: 1 }]
    }
  };

  for (const [type, doc] of Object.entries(raw)) {
    const { public: pub, key } = splitQuestionData(type, doc, `q-${type}`);
    // Dokumen publik hasil split TIDAK BOLEH punya kunci — kalau iya, `mergeKeyIntoQuestion`
    // tidak bisa dibedakan dari "kunci belum termigrasi".
    const view = mergeKeyIntoQuestion(pub, { keyRevision: '1', type, ...key });
    assert.equal(view.type, type);
    // Setiap field kunci tipe harus muncul di view (artinya kunci terbaca).
    const expectKeys = {
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
    }[type];
    for (const f of expectKeys) {
      assert.ok(f in view, `${type}: kunci ${f} tidak terbaca`);
    }
    // Tidak boleh ada field kunci dari TIPE LAIN yang ikut.
    const otherTypeKeys = {
      single: ['correctValue', 'pairs', 'items'],
      multiple: ['answerIndex', 'pairs'],
      boolean: ['answerIndex', 'acceptedAnswers'],
      short_answer: ['correctBoolean', 'pairs'],
      essay: ['answerIndex', 'correctValue'],
      matching: ['answerIndex', 'items'],
      ordering: ['answerIndex', 'pairs'],
      numerical: ['answerIndex', 'correctIndices'],
      code: ['answerIndex', 'pairs'],
      case_study: []
    }[type];
    for (const f of otherTypeKeys) {
      assert.equal(f in view, false, `${type}: bocor field ${f}`);
    }
  }
});
