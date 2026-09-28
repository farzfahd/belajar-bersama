import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconCheck, IconFlag, IconWarn } from '../../../shared/icons';
import PageHeader from '../../../app/layout/PageHeader';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import Modal from '../../../shared/ui/Modal';
import Input from '../../../shared/ui/Input';
import PageLoading from '../../../shared/components/PageLoading';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import QuestionReportModal from '../../questions/components/QuestionReportModal';
import { useAttempt, useQuiz } from '../hooks/useQuizzes';
import { finalizeAttempt, gradeAnswerManually } from '../services/quizService';
import {
  ATTEMPT_STATUS,
  canFinalize,
  effectivePoints,
  formatDuration,
  indexSnapshot
} from '../utils/attemptEngine';
import QuestionAttemptForm from './QuestionAttemptForm';
import { toErrorMessage } from '../../../shared/utils/errors';

const STATUS_LABEL = {
  [ATTEMPT_STATUS.inProgress]: ['dim', 'Berjalan'],
  [ATTEMPT_STATUS.completed]: ['ok', 'Selesai'],
  [ATTEMPT_STATUS.pendingManualGrade]: ['warn', 'Menunggu penilaian'],
  [ATTEMPT_STATUS.graded]: ['accent', 'Dinilai']
};

function initialFeedback(answers, questionId) {
  const found = (Array.isArray(answers) ? answers : []).find((a) => a.questionId === questionId);
  return found?.manualFeedback || '';
}

// Form penilaian manual dalam dialog (bukan window.prompt): nilai dan umpan
// balik punya label, batas angka, dan pesan error yang jelas.
function ManualGradeDialog({ target, onClose, onSave, saving }) {
  const [score, setScore] = useState(String(target?.score ?? 0));
  const [feedback, setFeedback] = useState(target?.feedback || '');
  const max = Number(target?.maxPoints) || 0;
  const numeric = Number(score);
  const invalid = score === '' || !Number.isFinite(numeric) || numeric < 0 || (max > 0 && numeric > max);

  return (
    <Modal
      open
      onClose={onClose}
      title="Beri nilai manual"
      subtitle={target?.title}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button
            size="sm"
            loading={saving}
            disabled={invalid}
            onClick={() => onSave(numeric, feedback)}
            title={invalid ? 'Nilai harus berupa angka pada rentang yang diperbolehkan.' : undefined}
          >
            Simpan nilai
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label={`Nilai (0${max > 0 ? `-${max}` : ''})`}
          type="number"
          min={0}
          max={max || undefined}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          warning={score !== '' && !Number.isFinite(numeric) ? 'Nilai harus berupa angka.' : undefined}
          error={score !== '' && (numeric < 0 || (max > 0 && numeric > max)) ? `Nilai harus antara 0 dan ${max}.` : undefined}
          hint={max > 0 ? `Poin maksimal soal ini ${max}.` : undefined}
        />
        <div>
          <label className="eyebrow block" htmlFor="manual-feedback">
            Umpan balik (opsional)
          </label>
          <textarea
            id="manual-feedback"
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="mt-1.5 w-full rounded-smc border border-line bg-sunken px-3 py-2.5 text-[14px] text-ink placeholder:text-dimmer focus:outline-2 focus:outline-offset-1 focus:outline-accent"
            placeholder="Apa yang perlu diperbaiki di jawaban ini?"
          />
        </div>
      </div>
    </Modal>
  );
}

// Halaman hasil: /quiz/:quizId/attempt/:attemptId/result
//
// Skor, breakdown per soal, dan form penilaian manual untuk soal uraian/kode.
// Partner boleh mengisi nilai manual; hanya pemilik attempt yang boleh
// memfinalisasi skor (`finalizeAttempt`).
//
// Halaman ini SENGAJA tidak memakai `useQuestions`. Review attempt membaca
// `attempt.questionSnapshot` saja, sehingga attempt lama tetap terbuka dan
// terbaca apa adanya walau soal aslinya di Question Bank sudah diubah atau
// dihapus. `quiz` tetap diambil karena hanya untuk judul & pengaturan tampilan
// (`showExplanation`, `showAnswerMode`, `passingScorePercent`).
export default function QuizAttemptResultPage() {
  const { quizId, attemptId } = useParams();
  const spaceId = useSpaceId();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuthState();

  const { data: quiz } = useQuiz(spaceId, quizId);
  const { data: attempt, loading } = useAttempt(spaceId, quizId, attemptId);
  const [busyId, setBusyId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [gradeTarget, setGradeTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);

  // Soal untuk review = salinan snapshot, bukan dokumen soal.
  const snapshotById = useMemo(() => indexSnapshot(attempt?.questionSnapshot), [attempt]);

  if (loading) return <PageLoading label="Memuat hasil…" />;
  if (!attempt) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          icon={<IconWarn size={22} />}
          eyebrow="Hasil kuis"
          title="Attempt tidak ditemukan"
          description="Attempt ini tidak ada atau bukan milikmu."
        />
        <Button size="sm" onClick={() => navigate('/quiz')}>
          Kembali ke daftar kuis
        </Button>
      </div>
    );
  }

  const isOwner = attempt.uid === user?.uid;
  const [tone, statusLabel] = STATUS_LABEL[attempt.status] || STATUS_LABEL.inProgress;
  const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
  const pending = answers.filter(
    (a) => a.needsManualGrade && (a.manualScore === null || a.manualScore === undefined)
  );
  const showExplanation = quiz?.settings?.showExplanation !== false;
  const showAnswers = quiz?.settings?.showAnswerMode !== 'none';
  const canGrade = attempt.status !== ATTEMPT_STATUS.inProgress;

  const saveManual = async (questionId, maxPoints, current, feedback) => {
    setBusyId(questionId);
    try {
      await gradeAnswerManually(spaceId, quizId, attemptId, answers, questionId, current, feedback ?? '');
      toast.success('Nilai manual disimpan.');
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await finalizeAttempt(
        spaceId,
        quizId,
        attemptId,
        answers,
        attempt,
        quiz?.settings?.passingScorePercent
      );
      toast.success('Skor akhir disimpan.');
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={<IconCheck size={22} />}
        eyebrow="Hasil kuis"
        title={quiz?.title || 'Kuis'}
        description={`${attempt.score} / ${attempt.maxScore || 0} poin · ${attempt.scorePercent || 0}%`}
        actions={
          <>
            <Badge tone={tone}>{statusLabel}</Badge>
            {attempt.passed && <Badge tone="ok">Lulus</Badge>}
            {attempt.durationSeconds != null && (
              <Badge tone="dim">{formatDuration(attempt.durationSeconds)}</Badge>
            )}
          </>
        }
      />

      {pending.length > 0 && (
        <div className="card flex flex-col gap-2 border-l-2 border-l-warn pl-3">
          <p className="text-[13.5px] text-dim">
            {pending.length} soal menunggu penilaian manual (uraian/kode).{' '}
            {isOwner
              ? 'Partner juga bisa menilai — pilih "Beri nilai" pada soal yang relevan.'
              : 'Kamu bisa membantu menilai soal-soal di bawah.'}
          </p>
          {isOwner && canFinalize(answers) && (
            <Button size="sm" className="self-start" disabled={finalizing} onClick={handleFinalize}>
              {finalizing ? 'Menyimpan…' : 'Finalisasi skor akhir'}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {answers.map((a, i) => {
          const question = snapshotById.get(a.questionId);
          const points = Number(question?.points) || 0;
          const needsManual = a.needsManualGrade;
          const graded = a.manualScore !== null && a.manualScore !== undefined;
          return (
            <div key={a.questionId || i} className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow">Soal {i + 1}</span>
                <span className="flex items-center gap-1.5">
                  {needsManual ? (
                    <Badge tone={graded ? 'ok' : 'warn'}>
                      <IconFlag size={11} /> {graded ? `Nilai ${a.manualScore}` : 'Menunggu nilai'}
                    </Badge>
                  ) : a.isCorrect ? (
                    <Badge tone="ok">Benar</Badge>
                  ) : (
                    <Badge tone="danger">Salah</Badge>
                  )}
                  <Badge tone="dim">
                    {effectivePoints(a)} / {points}
                  </Badge>
                </span>
              </div>

              {showAnswers && (
                <QuestionAttemptForm
                  question={question}
                  value={a.userAnswer ?? null}
                  onChange={() => {}}
                  review
                  disabled
                />
              )}

              {showExplanation && question?.explanation && (
                <p className="rounded-smc border border-line bg-bg2 px-3 py-2 text-[13px] leading-relaxed text-dim">
                  {question.explanation}
                </p>
              )}

              {needsManual && graded && a.manualFeedback && (
                <p className="text-[13px] text-dim">Umpan balik: {a.manualFeedback}</p>
              )}

              {needsManual && canGrade && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === a.questionId}
                  onClick={() =>
                    setGradeTarget({
                      questionId: a.questionId,
                      maxPoints: points,
                      score: a.manualScore ?? 0,
                      feedback: initialFeedback(answers, a.questionId),
                      title: question?.prompt
                    })
                  }
                >
                  <IconFlag size={13} /> Beri nilai
                </Button>
              )}

              {/* Melaporkan soal dari halaman hasil: boleh kapan saja, tanpa
                  menyentuh nilai attempt yang sudah dinilai. */}
              {question && question.available !== false && (
                <Button
                  size="sm"
                  variant="subtle"
                  className="self-start"
                  onClick={() => setReportTarget(question)}
                  title="Laporkan soal ini kalau jawabannya salah, typo, atau membingungkan"
                >
                  <IconFlag size={13} /> Laporkan soal
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate(`/quiz/${quizId}`)}>
          Kembali ke kuis
        </Button>
        {isOwner && quiz?.settings?.allowRetry !== false && (
          <Button size="sm" onClick={() => navigate(`/quiz/${quizId}/attempt`)}>
            Coba lagi
          </Button>
        )}
      </div>

      {gradeTarget && (
        <ManualGradeDialog
          target={gradeTarget}
          saving={busyId === gradeTarget.questionId}
          onClose={() => setGradeTarget(null)}
          onSave={async (score, feedback) => {
            await saveManual(gradeTarget.questionId, gradeTarget.maxPoints, score, feedback);
            setGradeTarget(null);
          }}
        />
      )}

      <QuestionReportModal
        open={Boolean(reportTarget)}
        spaceId={spaceId}
        question={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </div>
  );
}

