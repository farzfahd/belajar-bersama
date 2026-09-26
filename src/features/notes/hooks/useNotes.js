import { collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { byUpdatedDesc, useMergedSnapshots } from '../../../shared/hooks/useMergedSnapshots';

// Catatan ruang yang terlihat oleh pengguna ini.
// Privasi ditegakkan Firestore Rules (bukan disembunyikan di UI), dan rules
// hanya bisa membuktikan query LIST bila field yang dicek ada di where-clause.
// Maka DUA listener: (1) shared & belum di-soft-delete, (2) milik sendiri
// termasuk yang ada di "Sampah". Hasilnya digabung di client.
export function useNotes(spaceId) {
  const { user } = useAuthState();
  const uid = user?.uid;

  return useMergedSnapshots(
    () => {
      if (!spaceId || !uid) return null;
      const notes = collection(db, ROOT.spaces, spaceId, COL.notes);
      return [
        query(notes, where('visibility', '==', 'shared'), where('deletedAt', '==', null)),
        query(notes, where('ownerId', '==', uid))
      ];
    },
    [spaceId, uid],
    { enabled: Boolean(spaceId && uid), compare: byUpdatedDesc }
  );
}
