// Import pakai ekstensi .js supaya modul ini bisa diimpor langsung oleh
// unit test Node (pola sama seperti features/progress/utils/progressData.js).
import { normalizeTags } from '../../../shared/utils/validate.js';
import { topicPath } from '../../topics/utils/tree.js';
import { visibleActiveNotes } from '../../notes/utils/visibility.js';
import { visibleActiveResources } from '../../resources/utils/visibility.js';

function cleanText(value, max = 600) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function pathText(topicId, topics) {
  return topicPath(topicId, topics)
    .map((topic) => topic.title)
    .join(' · ');
}

function recordFor(kind, item, topics) {
  const topicPathText = pathText(item.topicId, topics);
  const tags = normalizeTags(item.tags);
  const text =
    kind === 'note'
      ? cleanText([item.description, item.body].filter(Boolean).join(' '))
      : kind === 'resource'
        ? cleanText([item.description, item.author, item.url, item.type].filter(Boolean).join(' '))
        : cleanText(item.description);

  return {
    key: `${kind}:${item.id}`,
    kind,
    id: item.id,
    title: cleanText(item.title, 240),
    text,
    tags,
    topicId: item.topicId || null,
    topicPath: topicPathText,
    url: kind === 'resource' ? item.url || null : null,
    type: kind === 'resource' ? item.type || null : null,
    updatedAt: item.updatedAt || null
  };
}

export function buildSearchRecords({ topics = [], notes = [], resources = [], uid } = {}) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  const records = [];
  for (const topic of safeTopics) {
    if (!topic?.id) continue;
    records.push(recordFor('topic', { ...topic, topicId: topic.id }, safeTopics));
  }
  for (const note of visibleActiveNotes(notes, uid)) {
    records.push(recordFor('note', note, safeTopics));
  }
  for (const resource of visibleActiveResources(resources, uid)) {
    records.push(recordFor('resource', resource, safeTopics));
  }
  return records;
}

export function getTagCounts(records = []) {
  const counts = new Map();
  for (const record of records) {
    for (const tag of record.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
