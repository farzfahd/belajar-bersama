import { IconQuiz } from '../../../shared/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import Spinner from '../../../shared/components/Spinner';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useTopics } from '../../topics/hooks/useTopics';
import { useQuestions } from '../../questions/hooks/useQuestions';
import { useQuizzes } from '../hooks/useQuizzes';
import QuizFormModal from './QuizFormModal';
import { timeAgo } from '../../../shared/utils/time';
import { toErrorMessage } from '../../../shared/utils/errors';

// Daftar kuis ruang. Baca memakai useQuizzes (satu listener realtime).
export default function QuizListPage() {
  const toast = useToast();
  const { user } = useAuthState();
  const spaceId = useSpaceId();
  const navigate = useNavigate();
  const { data: topics = [] } = useTopics(spaceId);
  const { data: quizzes = [], loading, error } = useQuizzes(spaceId);
  // Satu listener soal tersimpan, dipakai bersama oleh form & picker.
  const { data: questions = [], loading: questionsLoading, error: questionsError } = useQuestions(spaceId);
  const [formOpen, setFormOpen] = useState(false);

  const topicTitle = (id) => topics.find((t) => t.id === id)?.title || 'Topik dihapus';

  const handleCreated = (quizId) => {
    setFormOpen(false);
    if (quizId) {
      toast.success('Kuis dibuat. Lanjut menyusun soal.');
      navigate(`/quiz/${quizId}`);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-head text-2xl text-ink">Quiz</h1>
          <p className="mt-1 text-[13.5px] text-dim">
            Kumpulan soal yang kamu susun. Buat soal baru atau pilih soal tersimpan, semuanya dari dalam editor kuis.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>＋ Buat Quiz</Button>
      </header>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <div className="rounded-smc border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4 text-[13.5px] text-ink">
          Gagal memuat daftar kuis: {error.message || String(error)}
        </div>
      ) : quizzes.length === 0 ? (
        <EmptyState
          icon={<IconQuiz size={26} />}
          title="Belum Ada Kuis"
          description="Buat kuis pertama, lalu tambahkan soal dari dalam editor kuis — buat baru atau pilih yang sudah tersimpan."
          action={<Button onClick={() => setFormOpen(true)}>＋ Buat Quiz</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {quizzes.map((quiz) => {
            const isOwner = quiz.createdBy === user?.uid;
            const total = quiz.questionIds?.length || 0;
            return (
              <li key={quiz.id} className="card space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="accent">{total} soal</Badge>
                      <Badge tone="dim">{topicTitle(quiz.topicId)}</Badge>
                      {!isOwner && <Badge tone="warn">Dibuat partner</Badge>}
                    </div>
                    <h2 className="font-head text-[17px] leading-snug text-ink">{quiz.title}</h2>
                    {quiz.description && (
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-dim">{quiz.description}</p>
                    )}
                    <p className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">
                      Diperbarui {timeAgo(quiz.updatedAt) || '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/quiz/${quiz.id}`)}>
                      {isOwner ? '✎ Buka editor' : 'Buka kuis'}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <QuizFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        spaceId={spaceId}
        topics={topics}
        questions={questions}
        questionsLoading={questionsLoading}
        questionsError={questionsError}
        onCreated={handleCreated}
      />
    </div>
  );
}
