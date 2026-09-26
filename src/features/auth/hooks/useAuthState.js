import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../lib/firebase';

export function useAuthState() {
  const [state, setState] = useState({ user: null, initializing: true });

  useEffect(() => {
    const un = onAuthStateChanged(auth, (user) => {
      setState({ user, initializing: false });
    });
    return un;
  }, []);

  // Dipakai VerifyScreen: auth.currentUser berubah setelah user.reload()
  // tanpa memicu onAuthStateChanged.
  const refresh = useCallback(() => {
    setState({ user: auth.currentUser, initializing: false });
  }, []);

  return { ...state, refresh };
}