import { collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useMergedSnapshots } from '../../../shared/hooks/useMergedSnapshots';

// Status baca per-user (not_started | reading | completed) milik sendiri +
// status pada resource shared (supaya badge "dibaca partner" tetap tampil).
// Status pada resource PRIVATE partner tidak bisa dibaca (rules).
export function useResourceStates(spaceId) {
  const { user } = useAuthState();
  const uid = user?.uid;

  return useMergedSnapshots(
    () => {
      if (!spaceId || !uid) return null;
      const states = collection(db, ROOT.spaces, spaceId, COL.resourceStates);
      return [
        query(states, where('uid', '==', uid)),
        query(states, where('resourceVisibility', '==', 'shared'))
      ];
    },
    [spaceId, uid],
    { enabled: Boolean(spaceId && uid) }
  );
}
