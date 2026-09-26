import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ROOT } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

// Subscribe live dokumen space. { data, loading, error, errorCode, pending }.
export function useSpace(spaceId) {
  const [state, setState] = useState({
    data: null,
    loading: Boolean(spaceId),
    error: null,
    errorCode: null,
    pending: false
  });

  useEffect(() => {
    if (!spaceId) return undefined;
    const ref = doc(db, ROOT.spaces, spaceId);
    const un = onSnapshot(
      ref,
      (snap) =>
        setState({
          data: snap.exists() ? snap.data() : null,
          loading: false,
          error: null,
          errorCode: null,
          pending: snap.metadata.hasPendingWrites
        }),
      (err) =>
        setState((s) => ({
          ...s,
          loading: false,
          error: toErrorMessage(err),
          errorCode: err?.code || null
        }))
    );
    return un;
  }, [spaceId]);

  return state;
}