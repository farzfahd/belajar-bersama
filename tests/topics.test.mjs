// Unit test utilitas pohon topik: kemajuan seluruh keturunan & urutan sibling.
// Dijalankan tanpa emulator: npm run test:topics
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  descendantIds,
  progressStats,
  renumberSiblings,
  reorderSiblings,
  subtreeTotals,
  topicPath,
  treeRoots
} from '../src/features/topics/utils/tree.js';

// Subject -> Topic -> Subtopic
// Subject2 -> Topic2 (tanpa anak)
const topics = [
  { id: 's1', parentId: null, level: 0, order: 0, status: 'learning' },
  { id: 't1', parentId: 's1', level: 1, order: 0, status: 'completed' },
  { id: 'st1', parentId: 't1', level: 2, order: 0, status: 'completed' },
  { id: 'st2', parentId: 't1', level: 2, order: 1, status: 'not_started' },
  { id: 's2', parentId: null, level: 0, order: 1, status: 'not_started' },
  { id: 't2', parentId: 's2', level: 1, order: 0, status: 'completed' }
];

test('descendantIds & topicPath bekerja di pohon 3 level', () => {
  assert.deepEqual(descendantIds('s1', topics).sort(), ['st1', 'st2', 't1']);
  assert.deepEqual(topicPath('st2', topics).map((t) => t.title ?? t.id), ['s1', 't1', 'st2']);
  assert.equal(treeRoots(topics).length, 2);
});

test('subtreeTotals menjumlahkan materi seluruh keturunan', () => {
  const totals = subtreeTotals(topics, { t1: 2, st2: 3 });
  assert.equal(totals.t1, 5, 't1 = 2 sendiri + 3 dari st2');
  assert.equal(totals.s1, 5, 's1 ikut menjumlahkan t1');
  assert.equal(totals.s2, 0);
});

test('progressStats menghitung seluruh keturunan, bukan hanya anak langsung', () => {
  // Halaman Subject: anak langsung = 1 topic, tapi keturunannya 3 (t1, st1, st2).
  const subject = progressStats(topics, 's1');
  assert.equal(subject.total, 3, 'topic + 2 subtopic ikut dihitung');
  assert.equal(subject.completed, 2, 't1 & st1 selesai');
  assert.equal(subject.pct, 67);

  // Halaman Topic: anak langsung = 2 subtopic (angka lama kebetulan sama).
  assert.deepEqual(progressStats(topics, 't1'), { total: 2, completed: 1, pct: 50 });

  // Subtopic daun: tidak ada keturunan -> pakai status sendiri.
  assert.deepEqual(progressStats(topics, 'st1', 'completed'), { total: 1, completed: 1, pct: 100 });
  assert.deepEqual(progressStats(topics, 'st2', 'not_started'), { total: 1, completed: 0, pct: 0 });

  // Topik yang tidak ada -> nol, tidak error.
  assert.deepEqual(progressStats(topics, 'hantu'), { total: 0, completed: 0, pct: 0 });
});

test('renumberSiblings menomori ulang 0..n-1 walau order lama bentrok/bolong', () => {
  const out = renumberSiblings([
    { id: 'a', parentId: null, level: 0, order: 7 },
    { id: 'b', parentId: null, level: 0, order: 7 },
    { id: 'c', parentId: null, level: 0, order: 2 }
  ]);
  assert.deepEqual(out.map((t) => [t.id, t.order]), [['c', 0], ['a', 1], ['b', 2]]);
});

test('reorderSiblings menggeser satu langkah lalu menomori ulang', () => {
  const siblings = [
    { id: 'a', parentId: null, level: 0, order: 0 },
    { id: 'b', parentId: null, level: 0, order: 1 },
    { id: 'c', parentId: null, level: 0, order: 2 }
  ];
  assert.deepEqual(reorderSiblings(siblings, 'c', -1).map((t) => [t.id, t.order]), [
    ['a', 0],
    ['c', 1],
    ['b', 2]
  ]);
  assert.deepEqual(reorderSiblings(siblings, 'a', 1).map((t) => [t.id, t.order]), [
    ['b', 0],
    ['a', 1],
    ['c', 2]
  ]);
  // tepi daftar: tidak ada perubahan -> jangan kirim batch sia-sia
  assert.deepEqual(reorderSiblings(siblings, 'a', -1), []);
  assert.deepEqual(reorderSiblings(siblings, 'c', 1), []);
  assert.deepEqual(reorderSiblings(siblings, 'hantu', -1), []);
});

test('reorderSiblings menormalkan sibling yang order-nya sama (kasus lama diam-diam)', () => {
  const siblings = [
    { id: 'x', parentId: 'p', level: 1, order: 1 },
    { id: 'y', parentId: 'p', level: 1, order: 1 },
    { id: 'z', parentId: 'p', level: 1, order: 1 }
  ];
  // urutan awal dipertahankan (sort stabil), lalu z naik satu slot
  const out = reorderSiblings(siblings, 'z', -1);
  assert.deepEqual(out.map((t) => [t.id, t.order]), [['x', 0], ['z', 1], ['y', 2]]);
  // semua order unik sesudahnya
  assert.equal(new Set(out.map((t) => t.order)).size, out.length);
});
