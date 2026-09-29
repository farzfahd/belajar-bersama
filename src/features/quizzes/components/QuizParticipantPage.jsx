// Halaman kuis untuk PESERTA (bukan pembuat). Dipakai route /quiz/:quizId saat
// `quiz.createdBy !== uid`. Prinsip: yang tampil hanya informasi + aksi mengerjakan
// - tidak ada satu pun kontrol edit, tidak ada listener bank soal, dan tidak
// ada penulisan apa pun. Participant juga tidak bisa memaksa masuk ke editor:
// route yang memilih halaman berdasarkan kepemilikan (lihat QuizRoutePage), dan
// `firestore.rules` menolak write dari selain pembuat.
import { IconArrowRight, IconClock, IconList, IconWarn } from '../../../shared/icons';
import { useNavigate, useParams } from 'react-router-dom';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import PageLoading from '../../../shared/components/PageLoading';
import StatusNote from '../../../shared/ui/StatusNote';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useTopics } from '../../topics/hooks/useTopics';
import { useAttempts } from '../hooks/useQuizzes';
import {
  ATTEMPT_STATUS,
  attemptScoreLabel,
  canStartNewAttempt,
  findInProgress
} from '../utils/attemptEngine';
import { timeAgo } from '../../../shared/utils/time';

const SHOW_ANSWER_LABEL = {
  none: 'Kunci tidak ditampilkan',
  after_each: 'Kunci muncul setelah tiap soal',
  after_all: 'Kunci muncul setelah semua soal'
};

export default function QuizParticipantPage({ quiz: quizProp }) {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const spaceId = useSpaceId();
  const { user } = useAuthState();
  const { data: topics = [] } = useTopics(spaceId);
  // Attempts adalah data PRIVAT (rules: resource.data.uid == auth.uid), jadi
  // listener ini hanya pernah berisi attempt milik peserta sendiri.
  const { data: attempts = [], loading } = useAttempts(spaceId, quizId);

  const quiz = quizProp;
  if (!quiz) {
    return <PageLoading label="Memuat kuis…" />;
  }

  const settings = quiz.settings || {};
  const questionCount = Array.isArray(quiz.questionIds) ? quiz.questionIds.length : 0;
  const maxAttempts = settings.maxAttempts ?? 3;
  const attemptsUsed = attempts.length;
  const remaining = Math.max(0, maxAttempts - attemptsUsed);
  const inProgress = findInProgress(attempts, user?.uid);
  const canStart = questionCount > 0 && canStartNewAttempt(attempts, maxAttempts, settings.allowRetry);
  const topicTitle = topics.find((t) => t.id === quiz.topicId)?.title;
  const creatorName = quiz.createdByName || 'Partner';

  return (
    <div className="space-y-6">
      <header className="space-y-3 border-b border-line pb-4">
        <Button variant="subtle" size="sm" onClick={() => navigate('/quiz')}>
          ← Semua kuis
        </Button>
        <div className="space-y-2">
          <p className="eyebrow">Kuis dari {creatorName}</p>
          <h1 className="font-head text-2xl leading-tight text-ink">{quiz.title}</h1>
          {quiz.description ? (
            <p className="max-w-prose text-[14px] leading-relaxed text-dim">{quiz.description}</p>
          ) : (
            <p className="text-[13.5px] text-dimmer">Tidak ada deskripsi untuk kuis ini.</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{questionCount} soal</Badge>
            {topicTitle && <Badge tone="dim">{topicTitle}</Badge>}
            <Badge tone="dim">
              <IconClock size={11} /> {settings.timeLimitMinutes > 0 ? `${settings.timeLimitMinutes} menit` : 'Tanpa batas waktu'}
            </Badge>
            <Badge tone={remaining > 0 ? 'dim' : 'warn'}>
              <IconList size={11} /> {attemptsUsed} / {maxAttempts} percobaan
            </Badge>
            {settings.passingScorePercent > 0 && (
              <Badge tone="dim">Nilai lulus {settings.passingScorePercent}%</Badge>
            )}
          </div>
        </div>
      </header>

      <StatusNote tone="info">{SHOW_ANSWER_LABEL[settings.showAnswerMode] || SHOW_ANSWER_LABEL.none}.</StatusNote>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Pengerjaanmu</h2>
          <Button
            disabled={!canStart}
            title={
              questionCount === 0
                ? 'Kuis ini belum punya soal.'
                : !canStart
                  ? 'Batas percobaan sudah habis.'
                  : inProgress
                    ? 'Lanjutkan percobaan yang sedang berjalan.'
                    : 'Mulai mengerjakan kuis.'
            }
            onClick={() => navigate(`/quiz/${quizId}/attempt`)}
          >
            {inProgress ? (
              <>
                Lanjutkan <IconArrowRight size={15} />
              </>
            ) : (
              <>
                Mulai kuis <IconArrowRight size={15} />
              </>
            )}
          </Button>
        </div>

        {!canStart && questionCount > 0 && (
          <StatusNote tone="warn">
            <span className="inline-flex items-center gap-1.5">
              <IconWarn size={13} /> Batas {maxAttempts} percobaan sudah habis. Minta pembuat kuis membuka
              percobaan tambahan.
            </span>
          </StatusNote>
        )}

        {loading && attempts.length === 0 ? (
          <p className="text-[13px] text-dimmer">Memuat riwayat percobaan…</p>
        ) : attempts.length === 0 ? (
          <p className="text-[13px] text-dimmer">Belum ada percobaan. Kuis aman untuk dikerjakan kapan saja.</p>
        ) : (
          <ul className="flex flex-col">
            {attempts.map((a) => (
              <li key={a.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      a.status === ATTEMPT_STATUS.inProgress
                        ? `/quiz/${quizId}/attempt`
                        : `/quiz/${quizId}/attempt/${a.id}/result`
                    )
                  }
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:text-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-ink">
                      {a.status === ATTEMPT_STATUS.inProgress
                        ? 'Sedang berjalan'
                        : a.status === ATTEMPT_STATUS.pendingManualGrade
                          ? 'Menunggu penilaian'
                          : attemptScoreLabel(a)}
                    </span>
                    <span className="block text-[12px] text-dimmer">
                      {timeAgo(a.startedAt)}
                      {a.finishedAt ? ` · selesai ${timeAgo(a.finishedAt)}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {a.passed && <Badge tone="ok">Lulus</Badge>}
                    <Badge
                      tone={
                        a.status === ATTEMPT_STATUS.inProgress
                          ? 'accent'
                          : a.status === ATTEMPT_STATUS.pendingManualGrade ||
                              a.status === ATTEMPT_STATUS.pendingGrading
                            ? 'warn'
                            : 'dim'
                      }
                    >
                      {a.status === ATTEMPT_STATUS.inProgress
                        ? 'Berjalan'
                        : a.status === ATTEMPT_STATUS.pendingManualGrade
                          ? 'Menunggu nilai'
                          : a.status === ATTEMPT_STATUS.pendingGrading
                            ? 'Menunggu penilaian'
                            : 'Selesai'}
                    </Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[12.5px] text-dimmer">
          Kamu bisa melaporkan soal yang bermasalah dari halaman pengerjaan: Reports ada di setiap soal,
          jadi jawabanmu tetap tersimpan seperti biasa.
        </p>
      </section>
    </div>
  );
}
