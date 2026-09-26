import { visibleActiveNotes } from '../../notes/utils/visibility.js';
import { visibleActiveResources } from '../../resources/utils/visibility.js';
import { STATUS_LABEL } from '../../../lib/constants.js';

export const ACTIVITY_TIME_ZONE = 'Asia/Jakarta';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const formatterCache = new Map();

export function toMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function getFormatter(timeZone, options) {
  const key = `${timeZone}:${JSON.stringify(options)}`;
  if (!formatterCache.has(key)) {
    formatterCache.set(key, new Intl.DateTimeFormat('en-CA', { timeZone, ...options }));
  }
  return formatterCache.get(key);
}

function getParts(value, timeZone, options) {
  const ms = toMillis(value);
  if (!ms) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    getFormatter(timeZone, options)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

export function dayKey(value, timeZone = ACTIVITY_TIME_ZONE) {
  const parts = getParts(value, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export function hourOfDay(value, timeZone = ACTIVITY_TIME_ZONE) {
  const parts = getParts(value, timeZone, { hour: '2-digit', hourCycle: 'h23' });
  return parts ? Number(parts.hour) % 24 : null;
}

function dateFromKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function shiftDayKey(key, amount) {
  const date = dateFromKey(key);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function startOfWeekKey(key) {
  const date = dateFromKey(key);
  if (!date) return null;
  const day = date.getUTCDay();
  return shiftDayKey(key, day === 0 ? -6 : 1 - day);
}

export function endOfWeekKey(key) {
  const start = startOfWeekKey(key);
  return start ? shiftDayKey(start, 6) : null;
}

export function isoWeekNumber(key) {
  const date = dateFromKey(key);
  if (!date) return 0;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

export function formatDayKey(key, options = {}) {
  const date = dateFromKey(key);
  if (!date) return '—';
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', ...options }).format(date);
}

export function formatWeekRange(startKey) {
  const endKey = endOfWeekKey(startKey);
  if (!startKey || !endKey) return '—';
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  const startText = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC', day: 'numeric', month: 'short'
  }).format(start);
  const endText = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric'
  }).format(end);
  return `${startText} – ${endText}`;
}

export function levelForCount(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

const PHASE_BY_STATUS = {
  not_started: 'started',
  draft: 'started',
  shared: 'learning',
  learning: 'learning',
  reading: 'learning',
  reviewed: 'learning',
  needs_revision: 'learning',
  completed: 'completed'
};

export function phaseForStatus(status, tone = '') {
  if (tone === 'ok') return 'completed';
  return PHASE_BY_STATUS[status] || (tone === 'warn' ? 'learning' : 'started');
}

function makeEvent({ id, timestamp, timeZone, ...event }) {
  const ms = toMillis(timestamp);
  const key = dayKey(ms, timeZone);
  if (!key) return null;
  return {
    id,
    timestamp: ms,
    dateKey: key,
    hour: hourOfDay(ms, timeZone),
    ...event
  };
}

function entityTitle(entity, fallback) {
  return String(entity?.title || '').trim() || fallback;
}

function addEntityEvents(events, entity, type, fallback, timeZone) {
  const createdAt = makeEvent({
    id: `${type}-${entity.id}-created`,
    timestamp: entity.createdAt,
    timeZone,
    entityType: type,
    entityId: entity.id,
    action: 'created',
    actorId: entity.createdBy || entity.ownerId || entity.addedBy || null,
    topicId: entity.id || entity.topicId || null,
    title: `${type === 'topic' ? 'Topik' : type === 'note' ? 'Catatan' : 'Resource'} baru: ${entityTitle(entity, fallback)}`,
    status: entity.status || 'not_started',
    tone: 'accent'
  });
  if (createdAt) events.push(createdAt);

  const createdMs = toMillis(entity.createdAt);
  const updatedMs = toMillis(entity.updatedAt);
  if (updatedMs > createdMs) {
    const updatedAt = makeEvent({
      id: `${type}-${entity.id}-updated`,
      timestamp: entity.updatedAt,
      timeZone,
      entityType: type,
      entityId: entity.id,
      action: 'updated',
      actorId: null,
      topicId: entity.id || entity.topicId || null,
      title: `${type === 'topic' ? 'Topik' : type === 'note' ? 'Catatan' : 'Resource'} diperbarui: ${entityTitle(entity, fallback)}`,
      status: entity.status || 'not_started',
      tone: 'dim'
    });
    if (updatedAt) events.push(updatedAt);
  }
}

function addStateEvents(events, states, parentMap, parentType, timeZone) {
  for (const state of states || []) {
    const parent = parentMap.get(state[parentType === 'note' ? 'noteId' : 'resourceId']);
    if (!parent) continue;
    const actions = [];
    if (parentType === 'note') {
      if (state.bookmarked) actions.push('Bookmark');
      if (state.understood) actions.push('Dipahami');
    } else if (state.status) {
      actions.push(STATUS_LABEL[state.status] || state.status || 'diperbarui');
    }
    const actionText = actions.length ? actions.join(' + ') : 'State diperbarui';
    const event = makeEvent({
      id: `${parentType}State-${state.id}`,
      timestamp: state.updatedAt,
      timeZone,
      entityType: `${parentType}State`,
      entityId: state.id,
      action: 'state',
      actorId: state.uid || null,
      topicId: parent.topicId || parent.id || null,
      title: `${actionText}: ${entityTitle(parent, parentType === 'note' ? 'Catatan' : 'Resource')}`,
      status: state.status || (state.understood ? 'completed' : 'learning'),
      tone: state.understood || state.status === 'completed' ? 'ok' : 'warn'
    });
    if (event) events.push(event);
  }
}

export function buildActivity({
  topics = [],
  notes = [],
  resources = [],
  noteStates = [],
  resourceStates = []
} = {}, { timeZone = ACTIVITY_TIME_ZONE } = {}) {
  const events = [];
  for (const topic of topics || []) addEntityEvents(events, topic, 'topic', 'Topik', timeZone);
  for (const note of notes || []) addEntityEvents(events, note, 'note', 'Catatan', timeZone);
  for (const resource of resources || []) addEntityEvents(events, resource, 'resource', 'Resource', timeZone);

  const noteMap = new Map((notes || []).map((note) => [note.id, note]));
  const resourceMap = new Map((resources || []).map((resource) => [resource.id, resource]));
  addStateEvents(events, noteStates, noteMap, 'note', timeZone);
  addStateEvents(events, resourceStates, resourceMap, 'resource', timeZone);

  return events
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp || String(a.title).localeCompare(String(b.title)));
}

export function buildHeatmapWeeks(events, count = 12, reference = new Date(), timeZone = ACTIVITY_TIME_ZONE) {
  const currentKey = dayKey(reference, timeZone) || dayKey(Date.now(), timeZone);
  const currentWeek = startOfWeekKey(currentKey);
  const grouped = new Map();
  const phases = new Map();
  for (const event of events || []) {
    grouped.set(event.dateKey, (grouped.get(event.dateKey) || 0) + 1);
    const currentPhase = phases.get(event.dateKey) || 'started';
    const eventPhase = phaseForStatus(event.status, event.tone);
    const phaseRank = { started: 1, learning: 2, completed: 3 };
    phases.set(event.dateKey, phaseRank[eventPhase] > phaseRank[currentPhase] ? eventPhase : currentPhase);
  }
  const weeks = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const start = shiftDayKey(currentWeek, -index * 7);
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const key = shiftDayKey(start, dayIndex);
      const eventCount = grouped.get(key) || 0;
      return {
        key,
        count: eventCount,
        level: levelForCount(eventCount),
        phase: phases.get(key) || 'empty',
        label: `${formatDayKey(key, { weekday: 'long', day: 'numeric', month: 'short' })}: ${eventCount} aktivitas`
      };
    });
    weeks.push({
      start,
      end: endOfWeekKey(start),
      label: formatWeekRange(start),
      days,
      total: days.reduce((sum, day) => sum + day.count, 0)
    });
  }
  return weeks;
}

export function buildHourGrid(events, reference = new Date(), timeZone = ACTIVITY_TIME_ZONE) {
  const currentKey = dayKey(reference, timeZone) || dayKey(Date.now(), timeZone);
  const start = startOfWeekKey(currentKey);
  const counts = new Map();
  for (const event of events || []) {
    const key = `${event.dateKey}:${event.hour}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {
    start,
    end: endOfWeekKey(start),
    days: Array.from({ length: 7 }, (_, dayIndex) => {
      const key = shiftDayKey(start, dayIndex);
      return {
        key,
        label: WEEKDAY_LABELS[dayIndex],
        hours: Array.from({ length: 24 }, (_, hour) => {
          const count = counts.get(`${key}:${hour}`) || 0;
          return {
            hour,
            count,
            level: levelForCount(count),
            label: `${WEEKDAY_LABELS[dayIndex]} ${String(hour).padStart(2, '0')}:00 · ${count} aktivitas`
          };
        })
      };
    })
  };
}

export function buildHistoryGroups(events) {
  const groups = new Map();
  for (const event of events || []) {
    const current = groups.get(event.dateKey) || [];
    current.push(event);
    groups.set(event.dateKey, current);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupedEvents]) => ({
      key,
      weekNumber: isoWeekNumber(key),
      events: groupedEvents.sort((a, b) => b.timestamp - a.timestamp)
    }));
}

function latestBy(items, key, uid) {
  const result = new Map();
  for (const item of items || []) {
    if (uid && item.uid !== uid) continue;
    const current = result.get(item[key]);
    if (!current || toMillis(item.updatedAt) >= toMillis(current.updatedAt)) result.set(item[key], item);
  }
  return result;
}

export function buildProgressSnapshot({
  topics = [],
  notes = [],
  resources = [],
  noteStates = [],
  resourceStates = [],
  uid
} = {}) {
  const visibleNotes = visibleActiveNotes(notes, uid);
  const visibleResources = visibleActiveResources(resources, uid);
  const ownNotes = visibleNotes.filter((note) => note.ownerId === uid);
  const ownResources = visibleResources.filter((resource) => resource.addedBy === uid);
  const visibleNoteIds = new Set(visibleNotes.map((note) => note.id));
  const visibleResourceIds = new Set(visibleResources.map((resource) => resource.id));
  const scopedNoteStates = (noteStates || []).filter((state) => visibleNoteIds.has(state.noteId));
  const scopedResourceStates = (resourceStates || []).filter((state) => visibleResourceIds.has(state.resourceId));
  const noteStateMap = latestBy(scopedNoteStates, 'noteId', uid);
  const resourceStateMap = latestBy(scopedResourceStates, 'resourceId', uid);
  const completedNotes = visibleNotes.filter((note) => note.status === 'completed');
  const completedResources = visibleResources.filter((resource) => resourceStateMap.get(resource.id)?.status === 'completed');
  const completedTopics = (topics || []).filter((topic) => topic.status === 'completed');
  const understoodNotes = Array.from(noteStateMap.values()).filter((state) => state.understood).length;
  const totalItems = (topics || []).length + visibleNotes.length + visibleResources.length;
  const completedItems = completedTopics.length + completedNotes.length + completedResources.length;
  const phaseCounts = [
    {
      key: 'not_started',
      label: 'Belum mulai',
      tone: 'dim',
      count:
        (topics || []).filter((topic) => phaseForStatus(topic.status) === 'started').length +
        visibleNotes.filter((note) => phaseForStatus(note.status) === 'started').length +
        visibleResources.filter((resource) => phaseForStatus(resourceStateMap.get(resource.id)?.status) === 'started').length
    },
    {
      key: 'learning',
      label: 'Sedang belajar',
      tone: 'warn',
      count:
        (topics || []).filter((topic) => phaseForStatus(topic.status) === 'learning').length +
        visibleNotes.filter((note) => phaseForStatus(note.status) === 'learning').length +
        visibleResources.filter((resource) => phaseForStatus(resourceStateMap.get(resource.id)?.status) === 'learning').length
    },
    {
      key: 'completed',
      label: 'Selesai',
      tone: 'ok',
      count: completedItems
    }
  ];
  const activity = buildActivity({ topics, notes: visibleNotes, resources: visibleResources, noteStates, resourceStates });
  return {
    topics: topics || [],
    notes: visibleNotes,
    resources: visibleResources,
    ownNotes,
    ownResources,
    noteStateMap,
    resourceStateMap,
    completedTopics,
    completedNotes,
    completedResources,
    understoodNotes,
    sharedMaterials: visibleNotes.filter((note) => note.visibility === 'shared').length + visibleResources.filter((resource) => resource.visibility === 'shared').length,
    totalItems,
    completedItems,
    score: totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
    phaseCounts,
    activity
  };
}

export function buildProgressSeries({
  topics = [],
  notes = [],
  resources = [],
  noteStates = [],
  resourceStates = [],
  uid
} = {}, count = 8, reference = new Date(), timeZone = ACTIVITY_TIME_ZONE) {
  const visibleNotes = visibleActiveNotes(notes, uid);
  const visibleResources = visibleActiveResources(resources, uid);
  const resourceStateMap = latestBy(resourceStates, 'resourceId', uid);
  const makeRecord = (timestamp, completed) => ({
    timestamp,
    dateKey: dayKey(timestamp, timeZone),
    completed
  });
  const records = [
    ...(topics || []).map((topic) => makeRecord(toMillis(topic.updatedAt) || toMillis(topic.createdAt), topic.status === 'completed')),
    ...visibleNotes.map((note) => makeRecord(toMillis(note.updatedAt) || toMillis(note.createdAt), note.status === 'completed')),
    ...visibleResources.map((resource) => makeRecord(
      toMillis(resourceStateMap.get(resource.id)?.updatedAt) || toMillis(resource.updatedAt) || toMillis(resource.createdAt),
      resourceStateMap.get(resource.id)?.status === 'completed'
    ))
  ].filter((record) => record.dateKey);
  const currentKey = dayKey(reference, timeZone) || dayKey(Date.now(), timeZone);
  const currentWeek = startOfWeekKey(currentKey);
  const series = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const start = shiftDayKey(currentWeek, -index * 7);
    const end = endOfWeekKey(start);
    const eligible = records.filter((record) => record.dateKey <= end);
    const completed = eligible.filter((record) => record.completed).length;
    const total = eligible.length;
    series.push({
      key: start,
      label: `W${isoWeekNumber(start)}`,
      value: total ? Math.round((completed / total) * 100) : 0,
      completed,
      total,
      projected: true
    });
  }
  return series;
}

export const ACHIEVEMENT_DEFINITIONS = [
  { key: 'first_topic', icon: '🗺️', title: 'Mulai roadmap', description: 'Buat satu topik pertama di ruang belajar.', goal: 1 },
  { key: 'first_note', icon: '📝', title: 'Catatan pertama', description: 'Simpan satu catatan milikmu.', goal: 1 },
  { key: 'first_resource', icon: '🔗', title: 'Sumber pertama', description: 'Tambahkan satu resource ke roadmap.', goal: 1 },
  { key: 'shared_material', icon: '🤝', title: 'Belajar berdua', description: 'Bagikan satu catatan atau resource.', goal: 1 },
  { key: 'understood_notes', icon: '🧠', title: 'Paham lima catatan', description: 'Tandai lima catatan sebagai dipahami.', goal: 5 },
  { key: 'completed_material', icon: '🏁', title: 'Lantai satu', description: 'Selesaikan lima materi di ruang ini.', goal: 5 }
];

export function buildAchievements(snapshot, { partnerPresent = false } = {}) {
  const values = {
    first_topic: snapshot.topics.length,
    first_note: snapshot.ownNotes.length,
    first_resource: snapshot.ownResources.length,
    shared_material: snapshot.sharedMaterials,
    understood_notes: snapshot.understoodNotes,
    completed_material: snapshot.completedItems
  };
  return ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const value = definition.key === 'first_topic' && partnerPresent ? values.first_topic : values[definition.key] || 0;
    const unlocked = value >= definition.goal;
    return {
      ...definition,
      value,
      unlocked,
      progress: Math.min(100, Math.round((value / definition.goal) * 100))
    };
  });
}
