import { useEffect, useState } from 'react';
import { subscribeQuestionReports } from '../services/questionService';
import { toErrorMessage } from '../../../shared/utils/errors';

/**
 * Listener report untuk satu soal. Hanya pemilik soal yang boleh `list`
 * (lihat catatan di `firestore.rules`), jadi hook ini hanya dipasang untuk
 * owner. Pelapor mendapat konfirmasi lewat toast, bukan daftar report.
 */
export function useQuestionReports(spaceId, questionId, { enabled = true } = {}) {
  const [state, setState] = useState({ data: [], loading: false, error: null });

  useEffect(() => {
    if (!enabled || !spaceId || !questionId) {
      setState({ data: [], loading: false, error: null });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    const un = subscribeQuestionReports(
      spaceId,
      questionId,
      (data) => setState({ data, loading: false, error: null }),
      (err) => setState({ data: [], loading: false, error: toErrorMessage(err) })
    );
    return un;
  }, [spaceId, questionId, enabled]);

  return state;
}
