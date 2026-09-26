// Unit test privasi: helper visibility + indeks pencarian global (CP2.7).
// Dijalankan tanpa emulator: npm run test:visibility
import test from 'node:test';
import assert from 'node:assert/strict';
import { noteVisibleTo, visibleActiveNotes } from '../src/features/notes/utils/visibility.js';
import {
  resourceVisibleTo,
  visibleActiveResources
} from '../src/features/resources/utils/visibility.js';
import {
  buildSearchRecords,
  getTagCounts
} from '../src/features/search/utils/buildSearchRecords.js';

const A = 'user-a';
const B = 'user-b';

const topics = [
  { id: 't1', title: 'Matematika', parentId: null, level: 0, order: 0 },
  { id: 't2', title: 'Probability', parentId: 't1', level: 1, order: 0 }
];

const notes = [
  { id: 'n-shared', title: 'Catatan bersama', body: 'isi bersama', visibility: 'shared', ownerId: A, topicId: 't2', tags: ['umon'] },
  { id: 'n-a-private', title: 'Rahasia A', body: 'rahasia a', visibility: 'private', ownerId: A, topicId: 't2', tags: ['rahasia'] },
  { id: 'n-b-private', title: 'Rahasia B', body: 'rahasia b', visibility: 'private', ownerId: B, topicId: 't2', tags: ['rahasia'] },
  { id: 'n-deleted', title: 'Sampah A', body: 'isi sampah', visibility: 'shared', ownerId: A, topicId: 't2', deletedAt: new Date() },
  { id: 'n-desc', title: 'Catatan berdeskripsi', body: 'body singkat', description: 'ringkasan khusus bayes', visibility: 'shared', ownerId: A, topicId: 't2', tags: [] }
];

const resources = [
  { id: 'r-shared', title: 'Dokumentasi', url: 'https://example.org', visibility: 'shared', addedBy: B, topicId: 't2', tags: ['umon'] },
  { id: 'r-b-private', title: 'Privat B', url: 'https://example.org/b', visibility: 'private', addedBy: B, topicId: 't2', tags: ['rahasia'] },
  { id: 'r-deleted', title: 'Terhapus', url: 'https://example.org/x', visibility: 'shared', addedBy: A, topicId: 't2', deletedAt: new Date(), tags: [] }
];

test('noteVisibleTo: shared atau milik sendiri saja', () => {
  assert.equal(noteVisibleTo(notes[0], B), true, 'shared terlihat partner');
  assert.equal(noteVisibleTo(notes[1], A), true, 'privat sendiri terlihat');
  assert.equal(noteVisibleTo(notes[2], A), false, 'privat partner tersembunyi');
  assert.equal(noteVisibleTo(notes[2], null), false, 'tanpa uid tidak ada yang terlihat');
  assert.equal(noteVisibleTo(null, A), false);
});

test('visibleActiveNotes: buang privat partner & yang di-soft-delete', () => {
  assert.deepEqual(visibleActiveNotes(notes, A).map((n) => n.id), ['n-shared', 'n-a-private', 'n-desc']);
  assert.deepEqual(visibleActiveNotes(notes, B).map((n) => n.id), ['n-shared', 'n-b-private', 'n-desc']);
  assert.deepEqual(visibleActiveNotes(null, A), []);
});

test('resourceVisibleTo: shared atau addedBy sendiri, deletedAt disembunyikan', () => {
  assert.equal(resourceVisibleTo(resources[0], A), true);
  assert.equal(resourceVisibleTo(resources[1], A), false);
  assert.equal(resourceVisibleTo(resources[1], B), true);
  assert.equal(resourceVisibleTo(resources[2], A), false, 'deletedAt tidak terlihat');
  assert.equal(resourceVisibleTo(resources[0], undefined), false);
});

test('visibleActiveResources: identik untuk pemirsa', () => {
  assert.deepEqual(visibleActiveResources(resources, A).map((r) => r.id), ['r-shared']);
  assert.deepEqual(visibleActiveResources(resources, B).map((r) => r.id), ['r-shared', 'r-b-private']);
});

test('indeks pencarian tidak memuat materi privat partner', () => {
  const records = buildSearchRecords({ topics, notes, resources, uid: A });
  const keys = records.map((r) => r.key);
  assert.ok(keys.includes('note:n-a-private'), 'privat sendiri tetap bisa dicari');
  assert.ok(keys.includes('note:n-shared'));
  assert.ok(!keys.includes('note:n-b-private'), 'privat partner tidak boleh masuk indeks');
  assert.ok(!keys.includes('resource:r-b-private'), 'resource privat partner tidak boleh masuk indeks');
  assert.ok(!keys.includes('note:n-deleted') && !keys.includes('resource:r-deleted'), 'deletedAt dikecualikan');
});

test('tanpa uid tidak ada materi yang diindeks (hanya topik)', () => {
  // Pemirsa tanpa uid (mis. sesi belum siap) tidak boleh melihat apa pun
  // milik siapa pun — termasuk materi shared.
  const records = buildSearchRecords({ topics, notes, resources });
  assert.deepEqual(records.map((r) => r.key), ['topic:t1', 'topic:t2']);
});

test('jumlah tag juga privat: tag rahasia partner tidak ikut terhitung', () => {
  const asA = getTagCounts(buildSearchRecords({ topics, notes, resources, uid: A }));
  const asB = getTagCounts(buildSearchRecords({ topics, notes, resources, uid: B }));
  const tagA = asA.find((t) => t.tag === 'rahasia');
  const tagB = asB.find((t) => t.tag === 'rahasia');
  assert.equal(tagA.count, 1, 'A hanya punya tag rahasia dari catatannya sendiri');
  assert.equal(tagB.count, 2, 'B punya tag rahasia dari note privat + resource privatnya');
  assert.ok(!asB.some((t) => t.tag === 'rahasia' && t.count > 2), 'tag partner tidak ikut dihitung');
  assert.equal(asA.find((t) => t.tag === 'umon').count, 2, 'tag bersama terhitung dari note + resource');
});

test('path topik ikut terindeks & deskripsi note ikut dicari', () => {
  const records = buildSearchRecords({ topics, notes, resources, uid: A });
  const note = records.find((r) => r.key === 'note:n-desc');
  assert.equal(note.topicPath, 'Matematika · Probability');
  assert.match(note.text, /ringkasan khusus bayes/, 'description ikut diindeks (selaras resource)');
  const resource = records.find((r) => r.key === 'resource:r-shared');
  assert.equal(resource.topicPath, 'Matematika · Probability');
  assert.match(resource.text, /https:\/\/example\.org/);
});

test('tag dinormalisasi (lowercase, tanpa duplikat) di tiap record', () => {
  const records = buildSearchRecords({
    topics: [],
    notes: [{ id: 'n1', title: 'x', body: 'y', visibility: 'shared', ownerId: A, topicId: 't1', tags: [' Bayes ', 'bayes', 'BILANG'] }],
    resources: [],
    uid: A
  });
  assert.deepEqual(records[0].tags, ['bayes', 'bilang']);
});
