import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconClock, IconFlag, IconQuiz, IconWarn } from '../../../shared/icons';
import PageHeader from '../../../app/layout/PageHeader';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import Modal from '../../../shared/ui/Modal';
import PageLoading from '../../../shared/components/PageLoading';
import StatusNote from '../../../shared/ui/StatusNote';
import { useToast } from '../../../shared/components/ToastProvider';
import { useSpaceId } from '../../space/SpaceContext';
import { useQuestions } from '../../questions/hooks/useQuestions';
import QuestionReportModal from '../../questions/components/QuestionReportModal';
import { useAttempt, useQuiz } from '../hooks/useQuizzes';
import { saveAttemptDraft, startAttempt, submitAttempt } from '../services/quizService';
import {
  ATTEMPT_STATUS,
  computeDurationSeconds,
  findUnanswered,
  formatDuration,
  gradeAnswerFor,
  indexSnapshot,
  isV3Attempt,
  remainingSeconds
} from '../utils/attemptEngine';
import QuestionAttemptForm from './QuestionAttemptForm';
import { toErrorMessage } from '../../../shared/utils/errors';

// Halaman pengerjaan kuis: /quiz/:quizId/attempt
//
// Alur: attempt dibuat otomatis saat halaman dibuka, dan saat itu SELURUH isi
// soal disalin ke `questionSnapshot`. Setelah itu halaman ini TIDAK PERNAH
// membaca Question Bank lagi untuk menentukan soal yang sedang dikerjakan:
// render dan submit semuanya memakai `attempt.questionSnapshot`. Efeknya:
// walaupun soalnya diubah/dihapus di Question Bank setelah attempt dimulai,
// attempt ini tetap menampilkan versi yang sama.
//
// Dua jalur penilaian, sesuai versi attempt:
//   v3 (baru) — snapshot tanpa kunci, jadi halaman ini tidak pernah menilai.
//               Entri jawaban hanya `{questionId, userAnswer}` dan nilainya
//               dihitung server dari dokumen kunci privat.
//   v2 (lama) — snapshot menyalin kunci, jadi indikator benar/salah di layar
//               masih bisa dihitung di sini seperti sebelumnya.
//
// Pengiriman jawaban dilindungi dialog: jawaban yang kosong didaftarkan lebih
// dulu, dan perpindahan ke halaman hasil HANYA terjadi setelah `submitAttempt`
// benar-benar berhasil. Kalau gagal, jawaban tetap ada di state lokal dan
// peserta bisa mencoba lagi.
export default function QuizAttemptPage() {
  const { quizId } = useParams();
  const spaceId = useSpaceId();
  const toast = useToast();
  const navigate = useNavigate();

  const { data: quiz, loading: quizLoading } = useQuiz(spaceId, quizId);
  // `questions` hanya dibutuhkan untuk menyalin snapshot saat attempt dibuat.
  const { data: questions = [], loading: questionsLoading, error: questionsError } = useQuestions(spaceId);

  const [attemptId, setAttemptId] = useState(null);
  const { data: attempt, loading: attemptLoading } = useAttempt(spaceId, quizId, attemptId);
  const [answers, setAnswers] = useState([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const submittingRef = useRef(false);
  // Status pengiriman: 'idle' | 'confirm' | 'submitting' | 'error'
  const [submitPhase, setSubmitPhase] = useState('idle');
  const [submitError, setSubmitError] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);

  // Sumber kebenaran soal SELAMA pengerjaan: salinan di attempt.
  const snapshotById = useMemo(() => indexSnapshot(attempt?.questionSnapshot), [attempt]);

  // Buat attempt sekali saat halaman dibuka.
  //
  // WAJIB menunggu Question Bank selesai dimuat. `useQuestions` mengembalikan
  // `[]` selagi loading, dan snapshot dibangun dari daftar itu — kalau attempt
  // dimulai duluan, SEMUA entri snapshot tersimpan sebagai `unavailable` dan
  // attempt jadi tidak bisa dikerjakan sama sekali.
  useEffect(() => {
    if (attemptId || !spaceId || !quizId || !quiz) return undefined;
    if (quizLoading || questionsLoading) return undefined;
    if (questionsError) {
      toast.error(questionsError);
      return undefined;
    }
    let cancelled = false;
    startAttempt(spaceId, quizId, quiz, questions)
      .then((id) => {
        if (!cancelled) setAttemptId(id);
      })
      .catch((err) => toast.error(toErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [spaceId, quizId, quiz, questions, quizLoading, questionsLoading, questionsError, attemptId, toast]);

  // Attempt yang sudah selesai → langsung ke halaman hasil.
  useEffect(() => {
    if (attempt?.status && attempt.status !== ATTEMPT_STATUS.inProgress) {
      navigate(`/quiz/${quizId}/attempt/${attempt.id}/result`, { replace: true });
    }
  }, [attempt, quizId, navigate]);

  useEffect(() => {
    if (Array.isArray(attempt?.answers) && attempt.answers.length) setAnswers(attempt.answers);
  }, [attempt]);

  const answerAt = answers[index];

  const setAnswer = useCallback(
    (next) => {
      setAnswers((prev) => {
        const current = prev[index];
        if (!current) return prev;
        const updated = [...prev];
        if (isV3Attempt(attempt)) {
          // Attempt v3: entri jawaban HANYA boleh memuat `questionId` dan
          // `userAnswer` (`ownerAnswerEntryOk` di rules memakai `hasOnly`), dan
          // snapshot-nya tidak memuat kunci sama sekali. Jadi di sini TIDAK ADA
          // penilaian: menghitungnya di client berarti dua kebocoran sekaligus —
          // field nilai ditolak rules, dan `isCorrect` yang salah dihitung akan
          // muncul di layar peserta sebagai "salah" padahal belum dinilai.
          updated[index] = { questionId: current.questionId, userAnswer: next ?? null };
          return updated;
        }
        // Attempt v2 (lama): nilai ulang entri ini dengan kunci jawaban dari
        // SNAPSHOT — bukan dari Question Bank — supaya indikator benar/salah
        // tidak ikut berubah kalau soalnya diedit di bank soal setelah attempt
        // dimulai.
        updated[index] = {
          ...current,
          ...gradeAnswerFor(current.questionId, snapshotById.get(current.questionId), next)
        };
        return updated;
      });
    },
    [index, snapshotById, attempt]
  );

  // Autosave jawaban setiap kali soal berpindah.
  useEffect(() => {
    if (!attemptId || !answers.length || !attempt) return;
    if (attempt.status !== ATTEMPT_STATUS.inProgress) return;
    if (!answers.some((a) => a && a.userAnswer !== null && a.userAnswer !== undefined)) return;
    saveAttemptDraft(spaceId, quizId, attemptId, answers).catch(() => {
      // Autosave gagal tidak boleh mengganggu pengerjaan; submit tetap mencoba.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, attemptId, spaceId, quizId]);

  const doSubmit = useCallback(
    async ({ auto = false } = {}) => {
      if (submittingRef.current || !attemptId) return;
      submittingRef.current = true;
      setBusy(true);
      setSubmitError(null);
      setSubmitPhase('submitting');
      try {
        const duration = computeDurationSeconds(attempt?.startedAt, new Date());
        await submitAttempt(
          spaceId,
          quizId,
          attemptId,
          answers,
          attempt,
          quiz?.settings?.passingScorePercent,
          attempt?.answers,
          duration
        );
        // Navigasi HANYA setelah server mengonfirmasi tersimpan.
        toast.success(auto ? 'Waktu habis — jawaban terkirim.' : 'Jawaban terkirim.');
        setSubmitPhase('idle');
        navigate(`/quiz/${quizId}/attempt/${attemptId}/result`, { replace: true });
      } catch (err) {
        // Jawaban TIDAK dihapus: state lokal tetap utuh supaya peserta bisa
        // menekan "Kirim ulang" tanpa menjawab ulang.
        const message = toErrorMessage(err, 'Gagal mengirim jawaban.');
        setSubmitError(message);
        setSubmitPhase('error');
        toast.error(message);
        submittingRef.current = false;
        setBusy(false);
      }
    },
    [attemptId, attempt, answers, spaceId, quizId, quiz, navigate, toast]
  );

  // Tombol "Kumpulkan jawaban" selalu lewat dialog: daftar soal yang belum
  // dijawab + konsekuensinya. Tidak ada auto-submit dari klik tombol ini.
  const requestSubmit = useCallback(() => {
    if (submittingRef.current) return;
    setSubmitPhase('confirm');
  }, []);

  // Timer: auto-submit saat sisa waktu habis.
  useEffect(() => {
    const limit = quiz?.settings?.timeLimitMinutes || 0;
    if (!limit || !attempt?.startedAt || attempt.status !== ATTEMPT_STATUS.inProgress) {
      setRemaining(null);
      return undefined;
    }
    const tick = () => {
      const left = remainingSeconds(limit, Date.now(), attempt.startedAt);
      setRemaining(left);
      if (left === 0 && !submittingRef.current) {
        toast.warn('Waktu habis — jawaban dikirim otomatis.');
        doSubmit({ auto: true });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [quiz, attempt, doSubmit, toast]);

  if (quizLoading || questionsLoading || (!attemptId && !quiz)) {
    return <PageLoading label="Menyiapkan kuis…" />;
  }
  if (!quiz) return null;
  if (attemptLoading && !attempt) return <PageLoading label="Memuat attempt…" />;

  const total = answers.length;
  // Satu sumber kebenaran untuk "sudah terjawab": dipakai header, dialog, dan
  // navigator soal supaya angkanya tidak pernah berbeda.
  const unanswered = findUnanswered(answers, snapshotById);
  const answeredCount = total - unanswered.count;
  const currentQuestion = snapshotById.get(answerAt?.questionId);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={<IconQuiz size={22} />}
        eyebrow="Pengerjaan kuis"
        title={quiz.title}
        description={`Soal ${index + 1} dari ${total} · ${answeredCount} dijawab`}
        actions={
          remaining !== null ? (
            <Badge tone={remaining <= 30 ? 'danger' : 'warn'}>
              <IconClock size={12} /> {formatDuration(remaining)}
            </Badge>
          ) : (
            <Badge tone="dim">Tanpa batas waktu</Badge>
          )
        }
      />

      <div className="card flex flex-col gap-4">
        {total === 0 ? (
          <p className="text-[13.5px] text-dimmer">Kuis ini belum punya soal.</p>
        ) : (
          <>
            <QuestionAttemptForm
              question={currentQuestion}
              value={answerAt?.userAnswer ?? null}
              onChange={setAnswer}
            />

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
                Sebelumnya
              </Button>
              <Button variant="ghost" size="sm" disabled={index >= total - 1} onClick={() => setIndex((i) => i + 1)}>
                Berikutnya
              </Button>
              {currentQuestion && currentQuestion.available !== false && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => setReportTarget(currentQuestion)}
                  title="Laporkan soal ini kalau jawabannya salah, typo, atau membingungkan"
                >
                  <IconFlag size={14} /> Laporkan soal
                </Button>
              )}
              <Button size="sm" className="ml-auto" disabled={busy} onClick={requestSubmit}>
                {busy ? 'Mengirim…' : 'Kumpulkan jawaban'}
              </Button>
            </div>

            {submitPhase === 'error' && (
              <StatusNote tone="danger">
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {submitError} Jawabanmu masih tersimpan di halaman ini — tidak ada yang hilang.
                  </span>
                  <button
                    type="button"
                    onClick={() => doSubmit()}
                    className="shrink-0 rounded-smc border border-danger px-2 py-1 font-mono text-[11px] uppercase tracking-[.06em] text-danger transition hover:bg-dangersoft"
                  >
                    Kirim ulang
                  </button>
                </span>
              </StatusNote>
            )}
          </>
        )}
      </div>

      {/* Navigasi cepat antar soal. Warna: biru = soal aktif, kuning = belum
          dijawab, netral = sudah dijawab (tidak ada penanda benar/salah di sini
          supaya jawaban tidak bocor sebelum attempt selesai). */}
      <div className="flex flex-wrap gap-1.5">
        {answers.map((a, i) => {
          const isUnanswered = unanswered.indices.includes(i);
          return (
            <button
              key={a?.questionId || i}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? 'true' : undefined}
              aria-label={`Soal ${i + 1}${isUnanswered ? ', belum dijawab' : ', sudah dijawab'}`}
              title={`Soal ${i + 1}${isUnanswered ? ' - belum dijawab' : ''}`}
              className={`h-8 w-8 rounded-smc border font-mono text-[12px] transition ${
                i === index
                  ? 'border-accent bg-accentsoft text-accent'
                  : isUnanswered
                    ? 'border-warn text-warn hover:bg-warnsoft'
                    : 'border-linestrong bg-bg2 text-dim hover:text-ink'
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Konfirmasi sebelum mengirim. Soal yang kosong didaftarkan sebagai
          peringatan (bukan error: boleh dikirim, tapi nilainya 0). */}
      <Modal
        open={submitPhase === 'confirm' || submitPhase === 'submitting'}
        onClose={submitPhase === 'submitting' ? undefined : () => setSubmitPhase('idle')}
        title={unanswered.hasUnanswered ? 'Kirim dengan soal belum dijawab?' : 'Kumpulkan jawaban?'}
        subtitle="Setelah dikirim, jawaban tidak bisa diubah lagi."
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={submitPhase === 'submitting'}
              onClick={() => setSubmitPhase('idle')}
            >
              Kembali menjawab
            </Button>
            <Button
              size="sm"
              loading={submitPhase === 'submitting'}
              onClick={() => doSubmit()}
            >
              {submitPhase === 'submitting' ? 'Mengirim…' : 'Kirim jawaban'}
            </Button>
          </>
        }
      >
        {unanswered.hasUnanswered ? (
          <div className="space-y-3">
            <StatusNote tone="warn">
              <span className="inline-flex items-start gap-1.5">
                <IconWarn size={14} className="mt-px shrink-0" />
                <span>
                  {unanswered.count} dari {total} soal belum dijawab: nomor{' '}
                  {unanswered.indices.map((i) => i + 1).join(', ')}. Soal yang kosong tetap dihitung 0
                  poin dan tidak bisa diisi setelah dikirim.
                </span>
              </span>
            </StatusNote>
            <div className="flex flex-wrap gap-1.5">
              {unanswered.indices.map((i) => (
                <Button
                  key={i}
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setIndex(i);
                    setSubmitPhase('idle');
                  }}
                  title={`Buka soal ${i + 1}`}
                >
                  Perbaiki soal {i + 1}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[14px] leading-relaxed text-dim">
            Semua {total} soal sudah dijawab. Jawaban akan langsung dinilai dan tidak bisa diubah.
          </p>
        )}
      </Modal>

      <QuestionReportModal
        open={Boolean(reportTarget)}
        spaceId={spaceId}
        question={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </div>
  );
}
