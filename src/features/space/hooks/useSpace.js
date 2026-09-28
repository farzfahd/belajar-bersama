import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ROOT } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

// Subscribe live dokumen space. { data, loading, error, errorCode, pending }.
//
// `loading` DITURUNKAN, bukan disimpan di state. Kalau `loading` disimpan lewat
// useState, nilainya hanya dihitung pada render pertama — ketika profile belum
// datang dan `spaceId` masih `undefined` sehingga nilainya `false`. Begitu
// `profile.spaceId` muncul, ada render (sebelum listener berdiri) dengan
// `loading=false` + `data=null` + `error=null`. SpaceGate membaca kombinasi itu
// sebagai "ruang hilang", jadi OnboardingScreen ("Mari bangun ruang belajar")
// sempat tampil ±150-330ms ke pengguna yang sebenarnya sudah punya ruang —
// terukur pada 12/12 muat dingin. Reset di dalam effect tidak menolong karena
// efeknya baru jalan SETELAH render yang salah itu.
//
// Menyimpan `settledFor` (spaceId yang statusnya sudah final) membuat
// `loading` selalu benar sejak render pertama untuk spaceId mana pun.
export function useSpace(spaceId) {
  const [state, setState] = useState({
    data: null,
    settledFor: null,
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
          settledFor: spaceId,
          error: null,
          errorCode: null,
          pending: snap.metadata.hasPendingWrites
        }),
      (err) =>
        setState((s) => ({
          ...s,
          settledFor: spaceId,
          error: toErrorMessage(err),
          errorCode: err?.code || null
        }))
    );
    return un;
  }, [spaceId]);

  // Belum ada spaceId = memang belum ada ruang (bukan sedang memuat), jadi
  // `loading` false agar Onboarding boleh tampil.
  const loading = Boolean(spaceId) && state.settledFor !== spaceId;

  return { data: state.data, loading, error: state.error, errorCode: state.errorCode, pending: state.pending };
}
