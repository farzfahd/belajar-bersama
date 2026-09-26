import { collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useMergedSnapshots } from '../../../shared/hooks/useMergedSnapshots';

// State per-user (bookmark/"dipahami") milik sendiri + state pada catatan
// shared (termasuk milik partner, untuk badge "dipahami partner").
// State pada catatan PRIVATE partner tidak bisa dibaca: rules memakai field
// `noteVisibility` yang diverifikasi dari dokumen catatannya.
export function useNoteStates(spaceId) {
  const { user } = useAuthState();
  const uid = user?.uid;

  return useMergedSnapshots(
    () => {
      if (!spaceId || !uid) return null;
      const states = collection(db, ROOT.spaces, spaceId, COL.noteStates);
      return [
        query(states, where('uid', '==', uid)),
        query(states, where('noteVisibility', '==', 'shared'))
      ];
    },
    [spaceId, uid],
    { enabled: Boolean(spaceId && uid) }
  );
}
