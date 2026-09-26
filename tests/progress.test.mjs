import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAchievements,
  buildActivity,
  buildHeatmapWeeks,
  buildHistoryGroups,
  buildHourGrid,
  buildProgressSeries,
  buildProgressSnapshot,
  dayKey
} from '../src/features/progress/utils/progressData.js';

const reference = new Date('2026-09-25T10:00:00+07:00');
const later = new Date('2026-09-25T18:00:00+07:00');

function fixture() {
  return {
    topics: [{ id: 'topic-1', title: 'Bayes', status: 'completed', createdBy: 'user-a', createdAt: reference, updatedAt: later }],
    notes: [
      { id: 'note-1', title: 'Catatan bersama', visibility: 'shared', status: 'completed', ownerId: 'user-a', topicId: 'topic-1', createdAt: reference, updatedAt: reference },
      { id: 'note-private', title: 'Rahasia', visibility: 'private', status: 'draft', ownerId: 'user-b', topicId: 'topic-1', createdAt: reference, updatedAt: reference }
    ],
    resources: [
      { id: 'resource-1', title: 'Dokumentasi', visibility: 'shared', addedBy: 'user-b', topicId: 'topic-1', createdAt: reference, updatedAt: reference },
      { id: 'resource-private', title: 'Rahasia', visibility: 'private', addedBy: 'user-b', topicId: 'topic-1', createdAt: reference, updatedAt: reference }
    ],
    noteStates: [{ id: 'note-1_user-a', noteId: 'note-1', uid: 'user-a', bookmarked: true, understood: true, updatedAt: reference }],
    resourceStates: [{ id: 'resource-1_user-a', resourceId: 'resource-1', uid: 'user-a', status: 'completed', updatedAt: reference }]
  };
}

test('dayKey menggunakan zona waktu Asia/Jakarta', () => {
  assert.equal(dayKey(reference), '2026-09-25');
  assert.equal(dayKey(new Date('2026-09-24T17:30:00Z')), '2026-09-25');
});

test('snapshot statistik memfilter materi private sebelum menghitung', () => {
  const snapshot = buildProgressSnapshot({ ...fixture(), uid: 'user-a' });
  assert.equal(snapshot.notes.length, 1);
  assert.equal(snapshot.resources.length, 1);
  assert.equal(snapshot.totalItems, 3);
  assert.equal(snapshot.completedItems, 3);
  assert.equal(snapshot.score, 100);
  assert.equal(snapshot.understoodNotes, 1);
});

test('activity memakai timestamp nyata dan menyaring state tanpa parent', () => {
  const data = fixture();
  const events = buildActivity({
    topics: data.topics,
    notes: data.notes.filter((note) => note.id === 'note-1'),
    resources: data.resources.filter((resource) => resource.id === 'resource-1'),
    noteStates: [...data.noteStates, { id: 'orphan', noteId: 'missing', uid: 'user-a', updatedAt: reference }],
    resourceStates: data.resourceStates
  });
  assert.equal(events.length, 6);
  assert.ok(events.some((event) => event.action === 'state' && event.entityType === 'noteState'));
  assert.ok(events.some((event) => event.action === 'state' && event.entityType === 'resourceState'));
  assert.equal(events.filter((event) => event.dateKey === '2026-09-25').length, 6);
});

test('heatmap, grid 7x24, dan jurnal dibangun dari event', () => {
  const data = fixture();
  const events = buildActivity({ topics: data.topics, notes: [data.notes[0]], resources: [data.resources[0]], noteStates: data.noteStates, resourceStates: data.resourceStates });
  const weeks = buildHeatmapWeeks(events, 2, reference);
  const grid = buildHourGrid(events, reference);
  const history = buildHistoryGroups(events);
  assert.equal(weeks.length, 2);
  assert.equal(grid.days.length, 7);
  assert.equal(grid.days[0].hours.length, 24);
  assert.equal(history[0].key, '2026-09-25');
  assert.equal(weeks[1].days.find((day) => day.key === '2026-09-25').phase, 'completed');
  assert.ok(history[0].weekNumber > 0);
});

test('progress series dan achievements memakai snapshot yang sama', () => {
  const snapshot = buildProgressSnapshot({ ...fixture(), uid: 'user-a' });
  const series = buildProgressSeries({ ...fixture(), uid: 'user-a' }, 2, reference);
  const achievements = buildAchievements(snapshot, { partnerPresent: true });
  assert.equal(series.length, 2);
  assert.equal(series.at(-1).value, 100);
  assert.equal(achievements.find((item) => item.key === 'first_note').unlocked, true);
  assert.equal(achievements.find((item) => item.key === 'understood_notes').unlocked, false);
});
