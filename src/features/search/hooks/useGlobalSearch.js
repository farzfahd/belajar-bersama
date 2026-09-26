import { useMemo } from 'react';
import Fuse from 'fuse.js';
import { useTopics } from '../../topics/hooks/useTopics';
import { useNotes } from '../../notes/hooks/useNotes';
import { useResources } from '../../resources/hooks/useResources';
import { buildSearchRecords, getTagCounts } from '../utils/buildSearchRecords';

const FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.32,
  minMatchCharLength: 2,
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'tags', weight: 0.25 },
    { name: 'topicPath', weight: 0.15 },
    { name: 'text', weight: 0.2 }
  ]
};

function timestampValue(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export function useGlobalSearch({ spaceId, uid, query = '', tag = '' }) {
  const topicsState = useTopics(spaceId);
  const notesState = useNotes(spaceId);
  const resourcesState = useResources(spaceId);

  const records = useMemo(
    () =>
      buildSearchRecords({
        topics: topicsState.data,
        notes: notesState.data,
        resources: resourcesState.data,
        uid
      }),
    [topicsState.data, notesState.data, resourcesState.data, uid]
  );

  const fuse = useMemo(() => new Fuse(records, FUSE_OPTIONS), [records]);

  const results = useMemo(() => {
    const normalizedQuery = String(query || '').trim();
    let matches;
    if (normalizedQuery.length < 2) {
      matches = records.slice();
      matches.sort((a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt));
    } else {
      matches = fuse.search(normalizedQuery).map((result) => result.item);
    }
    if (tag) matches = matches.filter((record) => record.tags.includes(tag));
    return matches.slice(0, 30);
  }, [fuse, records, query, tag]);

  const tags = useMemo(() => getTagCounts(records), [records]);
  const loading = topicsState.loading || notesState.loading || resourcesState.loading;
  const error = topicsState.error || notesState.error || resourcesState.error;

  return { results, tags, loading, error };
}
