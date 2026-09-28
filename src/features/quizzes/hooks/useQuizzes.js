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
//
// `reloadKey` dipakai tombol "Coba lagi" di QuizEditorPage: menaikkan nilainya
// membuat listener dilepas & dibuat ulang tanpa memuat ulang halaman.
// `errorCode` kode Firebase mentah (mis. 'permission-denied') supaya halaman
// bisa membedakan "akses ditolak" dari "gangguan jaringan".
//
// `enabled: false` dipakai route /quiz/:quizId yang sudah memuat kuisnya sendiri
// (untuk memilih editor atau detail peserta) - supaya tidak ada dua listener
// atas dokumen yang sama. Bentuk lama `useQuiz(spaceId, quizId, reloadKey)`
// tetap berlaku.
export function useQuiz(spaceId, quizId, options = 0) {
  const opts = typeof options === 'number' ? { reloadKey: options } : options || {};
  const { reloadKey = 0, enabled = true } = opts;
  const active = enabled && Boolean(spaceId) && Boolean(quizId);
  const [state, setState] = useState({
    data: null,
    loading: active,
    error: null,
    errorCode: null
  });

  useEffect(() => {
    if (!active) return undefined;
    setState((s) => ({ ...s, loading: true, data: null, error: null, errorCode: null }));
    const un = onSnapshot(
      doc(db, ROOT.spaces, spaceId, COL.quizzes, quizId),
      (snap) =>
        setState({
          data: snap.exists() ? { id: snap.id, ...snap.data() } : null,
          loading: false,
          error: null,
          errorCode: null
        }),
      (err) =>
        setState((s) => ({
          ...s,
          loading: false,
          // Editor kosong yang tampil seolah-olah berhasil adalah kegagalan,
          // jadi `data` sengaja dikosongkan saat listener gagal.
          data: null,
          error: toErrorMessage(err),
          errorCode: err?.code || null
        }))
    );
    return un;
  }, [spaceId, quizId, reloadKey, active]);

  return state;
}

// ===================================================================
// ATTEMPT ENGINE (CP2)
// ===================================================================

// Riwayat attempt milik pengguna pada satu kuis. Rules menjadikan attempts
// PRIVAT (`resource.data.uid == auth.uid`), jadi listener di sini otomatis
// hanya melihat attempt sendiri — tidak perlu filter uid di query.
export function useAttempts(spaceId, quizId) {
  const [state, setState] = useState({ data: [], loading: Boolean(spaceId && quizId), error: null });

  useEffect(() => {
    if (!spaceId || !quizId) return undefined;
    setState((s) => ({ ...s, loading: true }));
    const col = collection(db, ROOT.spaces, spaceId, COL.quizzes, quizId, COL.attempts);
    const un = onSnapshot(
      col,
      (snap) =>
        setState({
          data: snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.startedAt?.toMillis?.() || 0) - (a.startedAt?.toMillis?.() || 0)),
          loading: false,
          error: null
        }),
      (err) => setState((s) => ({ ...s, loading: false, error: toErrorMessage(err) }))
    );
    return un;
  }, [spaceId, quizId]);

  return state;
}

// Satu attempt. null = tidak ditemukan ATAU tidak boleh dibaca (attempt
// partner); keduanya sengaja tidak dibedakan agar keberadaan tidak bocor.
export function useAttempt(spaceId, quizId, attemptId) {
  const [state, setState] = useState({
    data: null,
    loading: Boolean(spaceId && quizId && attemptId),
    error: null
  });

  useEffect(() => {
    if (!spaceId || !quizId || !attemptId) return undefined;
    setState((s) => ({ ...s, loading: true, data: null }));
    const un = onSnapshot(
      doc(db, ROOT.spaces, spaceId, COL.quizzes, quizId, COL.attempts, attemptId),
      (snap) =>
        setState({
          data: snap.exists() ? { id: snap.id, ...snap.data() } : null,
          loading: false,
          error: null
        }),
      (err) => setState((s) => ({ ...s, loading: false, error: toErrorMessage(err) }))
    );
    return un;
  }, [spaceId, quizId, attemptId]);

  return state;
}
