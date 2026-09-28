// Route /quiz/:quizId. Satu route untuk dua tampilan, dipilih dari KEPEMILIKAN
// kuis (`createdBy === uid`), bukan dari URL terpisah - jadi membuka URL editor
// secara manual oleh peserta tidak pernah menampilkan editor.
//
// State gagal memuat TIDAK diulang di sini: dipakai ulang `quizEditorState`
// (fungsi murni yang sama dengan editor) supaya pesannya konsisten.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconSearch, IconWarn } from '../../../shared/icons';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import PageLoading from '../../../shared/components/PageLoading';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useQuiz } from '../hooks/useQuizzes';
import {
  EDITOR_STATE,
  canRetryEditor,
  editorFailureMessage,
  isValidQuizId,
  resolveQuizEditorState
} from '../utils/quizEditorState';
import QuizEditorPage from './QuizEditorPage';
import QuizParticipantPage from './QuizParticipantPage';

export default function QuizRoutePage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const spaceId = useSpaceId();
  const { user } = useAuthState();
  const routeIdValid = isValidQuizId(quizId);
  const [reloadKey, setReloadKey] = useState(0);

  const { data: quiz, loading, error, errorCode } = useQuiz(
    spaceId,
    routeIdValid ? quizId : '',
    reloadKey
  );

  const pageState = routeIdValid
    ? resolveQuizEditorState({ loading, error, errorCode, quiz })
    : EDITOR_STATE.notFound;

  if (pageState === EDITOR_STATE.loading) {
    return <PageLoading label="Memuat kuis…" />;
  }

  if (pageState !== EDITOR_STATE.ready) {
    const message = editorFailureMessage(pageState);
    const detail = error ? String(error.message || error) : '';
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/quiz')}>
          ← Kembali ke daftar kuis
        </Button>
        <EmptyState
          icon={pageState === EDITOR_STATE.notFound ? <IconSearch size={26} /> : <IconWarn size={26} />}
          title={message.title}
          description={detail ? `${message.description} (${detail})` : message.description}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {canRetryEditor(pageState) && (
                <Button onClick={() => setReloadKey((k) => k + 1)} title="Baca ulang dokumen kuis yang sama">
                  Coba lagi
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate('/quiz')}>
                Buka daftar kuis
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  // Satu listener di halaman ini; kedua halaman anak menerima `quiz` sebagai
  // prop sehingga tidak ada listener ganda atas dokumen yang sama.
  if (quiz.createdBy === user?.uid) return <QuizEditorPage quiz={quiz} />;
  return <QuizParticipantPage quiz={quiz} />;
}
