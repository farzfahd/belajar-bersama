import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ROOT } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

// Subscribe users/{uid}; auto-membuat profil jika belum ada (via ensureProfile di Gate).
//
// `loading` DITURUNKAN dari `settledFor` (uid yang statusnya sudah final),
// bukan disimpan di state. Kalau disimpan lewat useState, nilainya hanya
// dihitung pada render pertama — ketika `user` di Gate/SpaceGate belum
// tersedia sehingga `uid` masih `undefined` dan `loading` menjadi `false`.
// Begitu uid muncul ada render dengan `loading:false` + `data:null`, dan
// SpaceGate salah membacanya sebagai "belum punya ruang" sehingga
// OnboardingScreen ("Mari bangun ruang belajar") sempat tampil ke pengguna
// yang sebenarnya sudah punya ruang. Efeknya tidak terlihat di hook ini,
// hanya di konsumennya.
export function useProfile(uid) {
  const [state, setState] = useState({ data: null, settledFor: null, error: null });

  useEffect(() => {
    if (!uid) return undefined;
    const ref = doc(db, ROOT.users, uid);
    const un = onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? snap.data() : null, settledFor: uid, error: null }),
      (err) => setState((s) => ({ ...s, settledFor: uid, error: toErrorMessage(err) }))
    );
    return un;
  }, [uid]);

  return { data: state.data, loading: Boolean(uid) && state.settledFor !== uid, error: state.error };
}
