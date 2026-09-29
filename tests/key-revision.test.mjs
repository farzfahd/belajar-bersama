// ============================================================================
// REVISI KUNCI JAWABAN — immutability (Assessment Security, M5/PART 24).
// ============================================================================
//
// Aturan yang dijaga di sini:
//   1. Nomor revisi naik satu per perubahan kunci.
//   2. Revisi yang sudah ada TIDAK BOLEH ditimpa dengan isi berbeda.
//      (Isi yang sama tetap boleh, supaya migrasi idempoten.)
//   3. Attempt lama selalu menunjuk revisi yang dibuat saat attempt dimulai —
//      bukan revisi terbaru.
//
// Modul ini murni (tidak menyentuh Firebase) supaya bisa diuji tanpa emulator.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertKeyRevisionNotOverwritten,
  attemptQuestionIds,
  hasValidKeyRevisionNumber,
  keyDocsEqual,
  keyRevisionNumber,
  nextKeyRevisionFrom
} from '../src/features/questions/utils/keyRevision.js';

// ---------- 1. Penomoran revisi ----------

test('REVISI: nextKeyRevisionFrom naik satu', () => {
  assert.equal(nextKeyRevisionFrom(1), '2');
  assert.equal(nextKeyRevisionFrom('3'), '4');
  assert.equal(nextKeyRevisionFrom(7), '8');
  assert.equal(nextKeyRevisionFrom(99), '100');
});

test('REVISI: soal tanpa kunci → revisi pertama', () => {
  assert.equal(nextKeyRevisionFrom(undefined), '1');
  assert.equal(nextKeyRevisionFrom(null), '1');
  assert.equal(nextKeyRevisionFrom(''), '1');
  assert.equal(nextKeyRevisionFrom(0), '1');
  assert.equal(nextKeyRevisionFrom('bukan-angka'), '1');
  assert.equal(nextKeyRevisionFrom(-4), '1');
  assert.equal(nextKeyRevisionFrom(1.5), '1', 'pecahan ditolak, mulai dari 1');
});

test('REVISI: selalu dikembalikan sebagai string (urutan stabil)', () => {
  for (const input of [undefined, 0, 1, 41, '9']) {
    assert.equal(typeof nextKeyRevisionFrom(input), 'string');
  }
});

test('REVISI: keyRevisionNumber aman untuk perbandingan', () => {
  assert.equal(keyRevisionNumber('3'), 3);
  assert.equal(keyRevisionNumber(3), 3);
  assert.equal(keyRevisionNumber('abc'), 0);
  assert.equal(keyRevisionNumber(undefined), 0);
  assert.equal(keyRevisionNumber('0'), 0);
  assert.equal(keyRevisionNumber(-1), 0);
  assert.equal(keyRevisionNumber(null), 0);
});

test('REVISI: penomoran konsisten satu Indeks di depan', () => {
  // `keyRevisionNumber(nextKeyRevisionFrom(x))` harus selalu tepat satu lebih.
  for (const x of [undefined, 1, 2, 10, 999, '5']) {
    const next = keyRevisionNumber(nextKeyRevisionFrom(x));
    const cur = keyRevisionNumber(x);
    assert.equal(next, Math.max(cur, 0) + 1, `x=${x}`);
  }
});

// ---------- 2. Immutability ----------

test('REVISI: penimpaan dengan isi BERBEDA ditolak', () => {
  assert.throws(
    () =>
      assertKeyRevisionNotOverwritten(
        { keyRevision: '1', type: 'single', answerIndex: 1 },
        { keyRevision: '1', type: 'single', answerIndex: 2 }
      ),
    /sudah ada/
  );
});

test('REVISI: isi identik tetap diterima (migrasi idempoten)', () => {
  assert.doesNotThrow(() =>
    assertKeyRevisionNotOverwritten(
      { keyRevision: '1', type: 'single', answerIndex: 1, createdAt: 't1' },
      { keyRevision: '1', type: 'single', answerIndex: 1, createdAt: 't2' }
    )
  );
});

test('REVISI: urutan key objek tidak memengaruhi perbandingan', () => {
  assert.doesNotThrow(() =>
    assertKeyRevisionNotOverwritten(
      { keyRevision: '1', type: 'single', answerIndex: 0, tolerance: 1 },
      { tolerance: 1, answerIndex: 0, type: 'single', keyRevision: '1' }
    )
  );
});

test('REVISI: perubahan satu field saja sudah cukup untuk dianggap berbeda', () => {
  const base = { keyRevision: '1', type: 'numerical', correctValue: 5, tolerance: 0.1 };
  assert.throws(
    () => assertKeyRevisionNotOverwritten(base, { ...base, tolerance: 0.2 }),
    /sudah ada/
  );
  assert.throws(
    () => assertKeyRevisionNotOverwritten(base, { ...base, correctValue: 6 }),
    /sudah ada/
  );
});

test('REVISI: `createdAt`/`updatedAt` tidak dianggap sebagai perubahan isi', () => {
  const base = { keyRevision: '1', type: 'boolean', correctBoolean: true };
  assert.doesNotThrow(() =>
    assertKeyRevisionNotOverwritten({ ...base, createdAt: 1 }, { ...base, createdAt: 2 })
  );
  assert.doesNotThrow(() =>
    assertKeyRevisionNotOverwritten({ ...base, updatedAt: 1 }, { ...base, updatedAt: 2 })
  );
});

test('REVISI: field tambahan pada revisi yang ada dianggap perbedaan', () => {
  const base = { keyRevision: '1', type: 'single', answerIndex: 0 };
  assert.throws(
    () => assertKeyRevisionNotOverwritten(base, { ...base, note: 'tambahan' }),
    /sudah ada/
  );
});

test('REVISI: revisi yang belum ada = bebas menulis (tidak ada yang ditimpa)', () => {
  assert.doesNotThrow(() => assertKeyRevisionNotOverwritten(null, { anything: true }));
  assert.doesNotThrow(() => assertKeyRevisionNotOverwritten(undefined, { keyRevision: '1' }));
});

test('REVISI: perbedaan tipe soal pada revisi sama ditolak', () => {
  assert.throws(
    () =>
      assertKeyRevisionNotOverwritten(
        { keyRevision: '1', type: 'single', answerIndex: 0 },
        { keyRevision: '1', type: 'boolean', correctBoolean: true }
      ),
    /sudah ada/
  );
});

test('REVISI: perbedaan nomor revisi sendiri dianggap perbedaan isi', () => {
  assert.throws(
    () =>
      assertKeyRevisionNotOverwritten(
        { keyRevision: '1', type: 'single', answerIndex: 0 },
        { keyRevision: '2', type: 'single', answerIndex: 0 }
      ),
    /sudah ada/,
    'revisi berbeda adalah dokumen berbeda, bukan overwrite'
  );
});

// ---------- 3. keyDocsEqual ----------

test('REVISI: keyDocsEqual mencerminkan assertKeyRevisionNotOverwritten', () => {
  assert.equal(keyDocsEqual({ a: 1 }, { a: 1 }), true);
  assert.equal(keyDocsEqual({ a: 1 }, { a: 2 }), false);
  assert.equal(keyDocsEqual(null, { a: 1 }), true, 'belum ada = belum migrasi');
  assert.equal(keyDocsEqual(null, null), true, 'tidak ada apa pun untuk dimigrasi');
  // Asimetri ini disengaja: kunci yang ada tapi target-nya kosong berarti kunci
  // akan HILANG, dan itu harus dilaporkan sebagai perbedaan, bukan "sama".
  assert.equal(keyDocsEqual({ a: 1 }, null), false);
});

test('REVISI: keyDocsEqual mengabaikan timestamp', () => {
  assert.equal(keyDocsEqual({ a: 1, createdAt: 'x' }, { a: 1, createdAt: 'y' }), true);
});

// ---------- 4. Validasi attempt ----------

test('REVISI: entri attempt wajib punya nomor revisi valid', () => {
  assert.equal(hasValidKeyRevisionNumber({ keyRevision: '1' }), true);
  assert.equal(hasValidKeyRevisionNumber({ keyRevision: '2' }), true);
  assert.equal(hasValidKeyRevisionNumber({ keyRevision: 3 }), true);
});

test('REVISI: attempt tanpa revisi valid DITOLAK (tidak boleh dinilai terhadap "terbaru")', () => {
  for (const attempt of [{}, { keyRevision: '0' }, { keyRevision: 0 }, { keyRevision: 'abc' }, { keyRevision: null }]) {
    assert.equal(hasValidKeyRevisionNumber(attempt), false, JSON.stringify(attempt));
  }
  assert.equal(hasValidKeyRevisionNumber(null), false);
});

test('REVISI: attemptQuestionIds diambil dari snapshot', () => {
  assert.deepEqual(attemptQuestionIds({ questionSnapshot: [{ id: 'a' }, { id: 'b' }] }), ['a', 'b']);
  assert.deepEqual(attemptQuestionIds({}), []);
  assert.deepEqual(attemptQuestionIds(null), []);
  assert.deepEqual(attemptQuestionIds({ questionSnapshot: null }), []);
  // Entri rusak tidak boleh membuat pemanggil crash.
  assert.deepEqual(attemptQuestionIds({ questionSnapshot: [{ id: 'a' }, null, {}, { id: 'b' }] }), ['a', 'b']);
});

// ---------- 5. Skenario siklus hidup kunci ----------

test('REVISI: siklus edit kunci 3x menghasilkan revisi 1→2→3→4 tanpa menimpa', () => {
  const store = new Map();
  let current = null;

  const edit = (keyData) => {
    const revision = nextKeyRevisionFrom(current);
    const doc = { keyRevision: revision, ...keyData };
    // Immutability: kalau revisi sudah ada, isi harus sama.
    assertKeyRevisionNotOverwritten(store.get(revision) || null, doc);
    store.set(revision, doc);
    current = revision;
    return revision;
  };

  assert.equal(edit({ type: 'single', answerIndex: 0 }), '1');
  assert.equal(edit({ type: 'single', answerIndex: 1 }), '2');
  assert.equal(edit({ type: 'single', answerIndex: 1 }), '3'); // isi sama, revisi baru
  assert.equal(edit({ type: 'single', answerIndex: 2 }), '4');

  assert.equal(store.size, 4);
  // Attempt lama yang menunjuk revisi 1 TETAP melihat kunci lama.
  assert.equal(store.get('1').answerIndex, 0);
  assert.equal(store.get('4').answerIndex, 2);
});

test('REVISI: menjalankan migrasi dua kali menghasilkan kunci yang dianggap identik', () => {
  // Syarat idempoten: pass kedua harus melihat `alreadyMigrated`, bukan error.
  const target = { keyRevision: '1', type: 'numerical', correctValue: 42, tolerance: 0.1, createdAt: 2 };
  const firstRun = { keyRevision: '1', type: 'numerical', correctValue: 42, tolerance: 0.1, createdAt: 1 };
  assert.doesNotThrow(() => assertKeyRevisionNotOverwritten(firstRun, target));
  assert.equal(keyDocsEqual(firstRun, target), true);
});
