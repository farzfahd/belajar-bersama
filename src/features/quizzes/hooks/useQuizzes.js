import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

// Satu listener per pemanggil, mengikuti pola useTopics/useQuestions.
// Halaman /quiz memakai useQuizzes, halaman /quiz/:quizId memakai useQuiz —
// TIDAK ada listener per kartu soal (Bagian J/K).

// Daftar kuis di ruang; kedua anggota boleh membaca (lihat rules).
export function useQuizzes(spaceId) {
  const [state, setState] = useState({ data: [], loading: Boolean(spaceId), error: null });

  useEffect(() => {
    if (!spaceId) return undefined;
    setState((s) => ({ ...s, loading: true }));
    const un = onSnapshot(
      collection(db, ROOT.spaces, spaceId, COL.quizzes),
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          loading: false,
          error: null
        }),
      (err) => setState((s) => ({ ...s, loading: false, error: toErrorMessage(err) }))
    );
    return un;
  }, [spaceId]);

  return state;
}

// Satu kuis; null berarti "tidak ditemukan" (dokumen hilang atau di soft-delete).
export function useQuiz(spaceId, quizId) {
  const [state, setState] = useState({ data: null, loading: Boolean(spaceId && quizId), error: null });

  useEffect(() => {
    if (!spaceId || !quizId) return undefined;
    setState((s) => ({ ...s, loading: true, data: null }));
    const un = onSnapshot(
      doc(db, ROOT.spaces, spaceId, COL.quizzes, quizId),
      (snap) => setState({ data: snap.exists() ? { id: snap.id, ...snap.data() } : null, loading: false, error: null }),
      (err) => setState((s) => ({ ...s, loading: false, error: toErrorMessage(err) }))
    );
    return un;
  }, [spaceId, quizId]);

  return state;
}
