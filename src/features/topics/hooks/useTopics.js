import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

// Subscribe koleksi topik ruang; urutan disortir client (dataset kecil, 2 orang).
export function useTopics(spaceId) {
  const [state, setState] = useState({ data: [], loading: Boolean(spaceId), error: null });

  useEffect(() => {
    if (!spaceId) return undefined;
    const q = collection(db, ROOT.spaces, spaceId, COL.topics);
    const un = onSnapshot(
      q,
      (snap) =>
        setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null }),
      (err) => setState((s) => ({ ...s, loading: false, error: toErrorMessage(err) }))
    );
    return un;
  }, [spaceId]);

  return state;
}