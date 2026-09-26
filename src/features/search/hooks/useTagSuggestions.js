import { useMemo } from 'react';
import { useNotes } from '../../notes/hooks/useNotes';
import { useResources } from '../../resources/hooks/useResources';

// Tag yang sudah dipakai di ruang ini, untuk autocomplete input tag.
// Ringan: hanya mengumpulkan tag (bukan hasil search) dari catatan + resource
// yang terlihat pengguna; tidak memakai useGlobalSearch agar tidak mengurutkan
// ulang semua dokumen pada tiap ketikan.
export function useTagSuggestions(spaceId) {
  const notes = useNotes(spaceId);
  const resources = useResources(spaceId);

  return useMemo(() => {
    const counts = new Map();
    const bump = (tags) => {
      for (const tag of tags || []) {
        if (typeof tag !== 'string' || !tag) continue;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    };
    for (const note of notes.data || []) bump(note.tags);
    for (const resource of resources.data || []) bump(resource.tags);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [notes.data, resources.data]);
}
