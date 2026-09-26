import { collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { byUpdatedDesc, useMergedSnapshots } from '../../../shared/hooks/useMergedSnapshots';

/**
 * Hook realtime untuk memuat bank soal ruang dengan pola dual-listener:
 * 1) Soal bersama yang aktif (visibility == 'shared' && deletedAt == null)
 * 2) Soal milik sendiri (createdBy == uid), termasuk yang di Sampah.
 */
export function useQuestions(spaceId) {
  const { user } = useAuthState();
  const uid = user?.uid;

  return useMergedSnapshots(
    () => {
      if (!spaceId || !uid) return null;
      const questions = collection(db, ROOT.spaces, spaceId, COL.questions);
      return [
        query(questions, where('visibility', '==', 'shared'), where('deletedAt', '==', null)),
        query(questions, where('createdBy', '==', uid))
      ];
    },
    [spaceId, uid],
    { enabled: Boolean(spaceId && uid), compare: byUpdatedDesc }
  );
}
