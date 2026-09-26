import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ROOT } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

// Subscribe users/{uid}; auto-membuat profil jika belum ada (via ensureProfile di Gate).
export function useProfile(uid) {
  const [state, setState] = useState({ data: null, loading: Boolean(uid), error: null });

  useEffect(() => {
    if (!uid) return undefined;
    const ref = doc(db, ROOT.users, uid);
    const un = onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? snap.data() : null, loading: false, error: null }),
      (err) => setState((s) => ({ ...s, loading: false, error: toErrorMessage(err) }))
    );
    return un;
  }, [uid]);

  return state;
}