import { collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { byUpdatedDesc, useMergedSnapshots } from '../../../shared/hooks/useMergedSnapshots';

// Resource ruang yang terlihat oleh pengguna ini (privasi di rules, dua
// listener: "shared" + milik sendiri — lihat useNotes untuk penjelasan).
export function useResources(spaceId) {
  const { user } = useAuthState();
  const uid = user?.uid;

  return useMergedSnapshots(
    () => {
      if (!spaceId || !uid) return null;
      const resources = collection(db, ROOT.spaces, spaceId, COL.resources);
      return [
        query(resources, where('visibility', '==', 'shared')),
        query(resources, where('addedBy', '==', uid))
      ];
    },
    [spaceId, uid],
    { enabled: Boolean(spaceId && uid), compare: byUpdatedDesc }
  );
}
