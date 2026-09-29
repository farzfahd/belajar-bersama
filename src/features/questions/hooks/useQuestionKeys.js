import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { getQuestionKeys } from '../services/questionKeyService';

/**
 * Memuat DOKUMEN KUNCI untuk soal-soal MILIK SENDIRI saja.
 *
 * Kenapa hanya milik sendiri: policy P2 di `firestore.rules` menolak partner
 * membaca `questions/{qid}/key/{rev}`. Meminta kunci soal milik partner bukan
 * hanya gagal — kegagalan itu membocorkan bahwa kunci ada. Jadi daftar yang
 * diminta disaring di sini SEBELUM sampai ke Firestore, dan tidak ada jalur UI
 * yang bisa memaksa membaca kunci orang lain.
 *
 * Pengambilan dilakukan sekali per "tanda tangan" (id + revisi setiap soal) dan
 * memakai `getAll` di service (bukan satu get per soal), supaya membuka bank
 * soal tidak menghasilkan N+1 read.
 *
 * Mengembalikan `Map(questionId -> dokumen kunci)`. Soal yang belum punya
 * `keyRevision` (belum pernah disimpan lewat jalur baru) tidak diminta dan
 * tidak muncul di map — itu keadaan normal, bukan error.
 */
export function useQuestionKeys(spaceId, questions, { enabled = true } = {}) {
  const { user } = useAuthState();
  const uid = user?.uid;
  const [keys, setKeys] = useState(() => new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const entries = useMemo(() => {
    if (!uid) return [];
    return (Array.isArray(questions) ? questions : [])
      .filter((q) => q?.id && q.createdBy === uid && q.keyRevision != null)
      .map((q) => ({ questionId: q.id, keyRevision: q.keyRevision }));
  }, [questions, uid]);

  // `signature` = identitas isi daftar permintaan. Dipakai sebagai satu-satunya
  // pemicu efek supaya snapshot yang isinya sama tidak memicu baca ulang.
  const signature = useMemo(
    () => entries.map((e) => `${e.questionId}@${e.keyRevision}`).join('|'),
    [entries]
  );

  // Daftar terbaru disimpan di ref supaya efek bisa bergantung pada `signature`
  // (string) saja, bukan pada identitas array yang berubah tiap snapshot.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    if (!spaceId || !uid || !enabled || !signature) {
      setKeys(new Map());
      setError(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getQuestionKeys(spaceId, entriesRef.current)
      .then((map) => {
        if (!cancelled) setKeys(map);
      })
      .catch((err) => {
        if (!cancelled) {
          setKeys(new Map());
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId, uid, enabled, signature]);

  return { keys, loading, error };
}
