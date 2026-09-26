import { useMemo } from 'react';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useTopics } from '../../topics/hooks/useTopics';
import { useNotes } from '../../notes/hooks/useNotes';
import { useNoteStates } from '../../notes/hooks/useNoteStates';
import { useResources } from '../../resources/hooks/useResources';
import { useResourceStates } from '../../resources/hooks/useResourceStates';
import { visibleActiveNotes } from '../../notes/utils/visibility';
import { visibleActiveResources } from '../../resources/utils/visibility';
import { buildProgressSeries, buildProgressSnapshot } from '../utils/progressData';

export function useProgressData() {
  const spaceId = useSpaceId();
  const { user } = useAuthState();
  const uid = user?.uid;
  const topicsState = useTopics(spaceId);
  const notesState = useNotes(spaceId);
  const noteStatesState = useNoteStates(spaceId);
  const resourcesState = useResources(spaceId);
  const resourceStatesState = useResourceStates(spaceId);

  const notes = useMemo(
    () => visibleActiveNotes(notesState.data, uid),
    [notesState.data, uid]
  );
  const resources = useMemo(
    () => visibleActiveResources(resourcesState.data, uid),
    [resourcesState.data, uid]
  );
  const snapshot = useMemo(
    () =>
      buildProgressSnapshot({
        topics: topicsState.data,
        notes,
        resources,
        noteStates: noteStatesState.data,
        resourceStates: resourceStatesState.data,
        uid
      }),
    [topicsState.data, notes, resources, noteStatesState.data, resourceStatesState.data, uid]
  );
  const series = useMemo(
    () =>
      buildProgressSeries({
        topics: topicsState.data,
        notes: notesState.data,
        resources: resourcesState.data,
        noteStates: noteStatesState.data,
        resourceStates: resourceStatesState.data,
        uid
      }),
    [topicsState.data, notesState.data, resourcesState.data, noteStatesState.data, resourceStatesState.data, uid]
  );

  const sources = [
    ['topics', 'Topik', topicsState],
    ['notes', 'Catatan', notesState],
    ['noteStates', 'State catatan', noteStatesState],
    ['resources', 'Resource', resourcesState],
    ['resourceStates', 'State resource', resourceStatesState]
  ];
  const failedSources = sources
    .filter(([, , state]) => state.error)
    .map(([key, label, state]) => ({ key, label, error: state.error }));

  return {
    spaceId,
    uid,
    topics: topicsState.data,
    notes,
    resources,
    noteStates: noteStatesState.data,
    resourceStates: resourceStatesState.data,
    snapshot,
    series,
    loading: sources.some(([, , state]) => state.loading),
    error: failedSources.map((source) => source.error).join(' · ') || null,
    failedSources
  };
}
