import { IconEdit, IconQuiz } from '../../../shared/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../../app/layout/PageHeader';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import PageLoading from '../../../shared/components/PageLoading';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useTopics } from '../../topics/hooks/useTopics';
import { useQuizzes } from '../hooks/useQuizzes';
import { shouldNavigateAfterCreate, CREATE_WITHOUT_ID_MESSAGE } from '../utils/quizEditorState';
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
  // CATATAN: halaman daftar tidak lagi memuat bank soal. Form "Buat Quiz"
  // hanya meminta judul/deskripsi/topik; pemilihan soal tersimpan dipindah ke
  // Quiz Editor (yang memang sudah memuat bank soal untuk picker-nya).
  const [formOpen, setFormOpen] = useState(false);

  const topicTitle = (id) => topics.find((t) => t.id === id)?.title || 'Topik dihapus';

  // `QuizFormModal` memanggil `onCreated` HANYA setelah createQuiz benar-benar
  // sukses. Id hasil create-lah yang dipakai untuk navigasi — tidak ada id
  // kuis yang ditulis manual di mana pun. Kalau id tidak valid, kuis mungkin
  // sudah tercipta: pesannya jujur dan user TIDAK diminta membuat kuis kedua.
  const handleCreated = (quizId) => {
    setFormOpen(false);
    if (!shouldNavigateAfterCreate(quizId)) {
      toast.error(CREATE_WITHOUT_ID_MESSAGE);
      return;
    }
    toast.success('Kuis dibuat. Lanjut menyusun soal.');
    // `justCreated` membuat halaman editor tahu asal user, sehingga pesan
    // kegagalan tidak pernah menyarankan membuat kuis lagi.
    navigate(`/quiz/${quizId}`, { state: { justCreated: true } });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="learning berdua · kuis"
        icon={<IconQuiz size={26} />}
        title="Quiz"
        description="Kumpulan soal yang kamu susun. Buat soal baru atau pilih soal tersimpan, semuanya dari dalam editor kuis."
        actions={<Button onClick={() => setFormOpen(true)}>＋ Buat Quiz</Button>}
      />

      {loading ? (
        <PageLoading label="Memuat kuis…" />
      ) : error ? (
        <div className="rounded-smc border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4 text-[13.5px] text-ink">
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
              <li key={quiz.id} className="card space-y-2 py-4">
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
                      {isOwner && <IconEdit size={15} />}
                      {isOwner ? 'Buka editor' : 'Buka kuis'}
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
        onCreated={handleCreated}
      />
    </div>
  );
}
