import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import Input from '../../../shared/ui/Input';
import Select from '../../../shared/ui/Select';
import Spinner from '../../../shared/components/Spinner';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useTopics } from '../../topics/hooks/useTopics';
import { useQuestions } from '../../questions/hooks/useQuestions';
import QuestionFormModal from '../../questions/components/QuestionFormModal';
import QuestionDetailModal from '../../questions/components/QuestionDetailModal';
import { useQuiz } from '../hooks/useQuizzes';
import { deleteQuiz, updateQuiz, updateQuizQuestionIds } from '../services/quizService';
import { normalizeQuizSettings } from '../utils/quizSettings';
import {
  appendQuestionIds,
  buildQuizQuestionRows,
  moveQuestionIdAt,
  removeQuestionIdAt
} from '../utils/quizQuestions';
import QuestionPickerModal from './QuestionPickerModal';
import {
  QUIZ_LIMITS,
  QUIZ_SETTINGS_DEFAULTS,
  QUESTION_TYPE_LABELS
} from '../../../lib/constants';
import { timeAgo } from '../../../shared/utils/time';
import { toErrorMessage } from '../../../shared/utils/errors';

const SHOW_ANSWER_LABEL = {
  none: 'Jangan tampilkan',
  after_each: 'Setelah tiap soal',
  after_all: 'Setelah semua soal'
};

// Baris checkbox untuk pengaturan boolean.
function SwitchRow({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2.5 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-accent"
      />
      <span className="text-[13.5px] text-ink">{label}</span>
    </label>
  );
}

// Workspace penyusun kuis: header + pengaturan + daftar soal.
// Setiap aksi pada questionIds (tambah / hapus / ubah urutan) = SATU write,
// tidak ada write per keystroke dan tidak ada listener per baris soal.
export default function QuizEditorPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const spaceId = useSpaceId();
  const { user } = useAuthState();

  const { data: quiz, loading, error } = useQuiz(spaceId, quizId);
  const { data: topics = [] } = useTopics(spaceId);
  // Satu listener bank soal dipakai bersama oleh baris soal DAN picker.
  const { data: questions = [], loading: bankLoading, error: bankError } = useQuestions(spaceId);

  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [pending, setPending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [questionFormOpen, setQuestionFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);

  const isOwner = Boolean(quiz && quiz.createdBy === user?.uid);
  const locked = !isOwner;

  // Form diisi dari dokumen kuis; perubahan remote TIDAK menimpa ketikan yang
  // belum disimpan (dirty), supaya tidak ada write per karakter.
  useEffect(() => {
    if (!quiz) return;
    setForm((prev) => {
      if (prev && dirty) return prev;
      return {
        title: quiz.title || '',
        description: quiz.description || '',
        topicId: quiz.topicId || '',
        settings: { ...QUIZ_SETTINGS_DEFAULTS, ...(quiz.settings || {}) }
      };
    });
  }, [quiz, dirty]);

  // Baris SELALU mengikuti urutan questionIds; tidak ada sorting.
  const rows = useMemo(
    () => buildQuizQuestionRows(quiz?.questionIds, questions),
    [quiz?.questionIds, questions]
  );
  const missingCount = rows.filter((r) => r.missing).length;
  const topicTitle = (id) => topics.find((t) => t.id === id)?.title || 'Topik dihapus';

  const setField = (key) => (e) => {
    setDirty(true);
    setSaveError(null);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };
  const setSetting = (key, value) => {
    setDirty(true);
    setSaveError(null);
    setForm((f) => ({ ...f, settings: { ...f.settings, [key]: value } }));
  };
  const setSettingNumber = (key) => (e) => {
    const raw = e.target.value;
    setSetting(key, raw === '' ? '' : Number(raw));
  };

  const saveMeta = async () => {
    if (!form || !quiz) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Validasi penuh di quizSettings (rentang settings, batas 50, duplikat).
      // Dijalankan SEBELUM write supaya kesalahan range tampil sebagai pesan
      // ramah, bukan permission-denied dari rules.
      normalizeQuizSettings(form.settings);
      await updateQuiz(spaceId, quiz.id, {
        title: form.title,
        description: form.description,
        topicId: form.topicId,
        // questionIds diteruskan apa adanya: tetap snapshot, tidak ikut berubah
        // hanya karena metadata/pengaturan diedit.
        questionIds: quiz.questionIds,
        settings: form.settings
      });
      setDirty(false);
      toast.success('Kuis disimpan.');
    } catch (e) {
      const message = toErrorMessage(e, 'Gagal menyimpan kuis.');
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Helper untuk remove / move: array yang dikembalikan SAMA berarti gerakan
  // tidak mungkin (kepala, ekor, satu soal) -> write dibatalkan.
  const mutateIds = async (nextIds, message) => {
    if (!quiz || locked) return;
    if (nextIds === quiz.questionIds) return;
    setPending(true);
    try {
      await updateQuizQuestionIds(spaceId, quiz.id, nextIds);
      if (message) toast.success(message);
    } catch (e) {
      toast.error(toErrorMessage(e, 'Gagal mengubah daftar soal.'));
    } finally {
      setPending(false);
    }
  };

  const handleRemove = (row) => {
    const label = row.question ? row.question.prompt.slice(0, 40) : row.questionId;
    if (!window.confirm(`Keluarkan soal "${label}…" dari kuis?\n\nSoal tetap tersimpan di bank soal.`)) return;
    mutateIds(removeQuestionIdAt(quiz.questionIds, row.position), 'Soal dikeluarkan dari kuis.');
  };

  const handleMove = (row, delta) => {
    mutateIds(moveQuestionIdAt(quiz.questionIds, row.position, delta));
  };

  const handleAddFromBank = async (selectedIds) => {
    if (!quiz || locked) return;
    const next = appendQuestionIds(quiz.questionIds, selectedIds);
    if (next.length === quiz.questionIds.length) {
      toast.success('Tidak ada soal baru untuk ditambahkan.');
      return;
    }
    setPending(true);
    try {
      await updateQuizQuestionIds(spaceId, quiz.id, next);
      toast.success(`${next.length - quiz.questionIds.length} soal ditambahkan.`);
    } catch (e) {
      toast.error(toErrorMessage(e, 'Gagal menambah soal.'));
    } finally {
      setPending(false);
    }
  };

  // Soal baru dibuat dari editor otomatis masuk kuis ini, dan tetap ada di bank soal.
  const handleQuestionSaved = async (savedId) => {
    if (!savedId || !quiz || locked) return;
    const next = appendQuestionIds(quiz.questionIds, [savedId]);
    if (next.length === quiz.questionIds.length) return;
    setPending(true);
    try {
      await updateQuizQuestionIds(spaceId, quiz.id, next);
      toast.success('Soal baru ditambahkan ke kuis.');
    } catch (e) {
      toast.error(toErrorMessage(e, 'Gagal menautkan soal baru ke kuis.'));
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (!quiz) return;
    if (!window.confirm(`Hapus kuis "${quiz.title}"?\n\nSoal-soalnya tetap ada di bank soal.`)) return;
    try {
      await deleteQuiz(spaceId, quiz.id);
      toast.success('Kuis dihapus.');
      navigate('/quiz');
    } catch (e) {
      toast.error(toErrorMessage(e, 'Gagal menghapus kuis.'));
    }
  };


  // ---------- states halaman ----------
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={26} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/quiz')}>
          ← Kembali ke daftar kuis
        </Button>
        <p className="rounded-smc border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4 text-[13.5px] text-ink">
          Gagal memuat kuis: {error.message || String(error)}
        </p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/quiz')}>
          ← Kembali ke daftar kuis
        </Button>
        <EmptyState
          icon="🔍"
          title="Kuis Tidak Ditemukan"
          description="Kuis ini tidak ada di ruang ini, atau sudah dihapus."
          action={<Button onClick={() => navigate('/quiz')}>Lihat daftar kuis</Button>}
        />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={26} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---------- HEADER ---------- */}
      <header className="space-y-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="subtle" size="sm" onClick={() => navigate('/quiz')}>
            ← Semua kuis
          </Button>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-[10.5px] uppercase tracking-wider ${
                saveError ? 'text-accent' : 'text-dimmer'
              }`}
            >
              {saving
                ? 'Menyimpan…'
                : saveError
                  ? 'Gagal menyimpan'
                  : pending
                    ? 'Mengubah soal…'
                    : dirty
                      ? 'Belum disimpan'
                      : `Tersimpan · ${timeAgo(quiz.updatedAt) || '—'}`}
            </span>
            {isOwner && (
              <Button size="sm" onClick={saveMeta} loading={saving} disabled={!dirty}>
                Simpan
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="font-head text-2xl leading-tight text-ink">{quiz.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{rows.length} soal</Badge>
            <Badge tone="dim">{topicTitle(quiz.topicId)}</Badge>
            {!isOwner && <Badge tone="warn">Hanya pembuat yang bisa mengubah</Badge>}
          </div>
        </div>

        {isOwner && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleDelete}>
              Hapus kuis
            </Button>
          </div>
        )}
      </header>

      {locked && (
        <p className="rounded-smc border border-line bg-bg2 px-3 py-2 text-[13px] text-dim">
          Kamu adalah partner pembuat kuis ini, jadi isinya hanya bisa dibaca. Minta pembuat kuis untuk
          mengubahnya.
        </p>
      )}

      {saveError && !locked && (
        <p className="rounded-smc border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-[13px] text-ink">
          {saveError} Perubahanmu belum tersimpan — perbaiki lalu tekan Simpan lagi.
        </p>
      )}


      {/* ---------- PENGATURAN ---------- */}
      <section className="space-y-3">
        <h2 className="section-title">Pengaturan</h2>
        <Input
          label="Judul kuis"
          value={form.title}
          onChange={setField('title')}
          maxLength={QUIZ_LIMITS.maxTitle}
          disabled={locked}
        />
        <div>
          <label className="eyebrow block" htmlFor="quiz-editor-desc">
            Deskripsi
          </label>
          <textarea
            id="quiz-editor-desc"
            rows={2}
            value={form.description}
            onChange={setField('description')}
            maxLength={QUIZ_LIMITS.maxDescription}
            disabled={locked}
            className="mt-1.5 w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[14px] text-ink placeholder:text-dimmer transition focus:outline-2 focus:outline-offset-1 focus:outline-accent disabled:opacity-60"
            placeholder="Cakupan materi, catatan singkat…"
          />
        </div>
        <Select label="Topik" value={form.topicId} onChange={setField('topicId')} disabled={locked}>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Jumlah soal"
            type="number"
            min={QUIZ_LIMITS.minQuestions}
            max={QUIZ_LIMITS.maxQuestions}
            value={form.settings.questionCount}
            onChange={setSettingNumber('questionCount')}
            disabled={locked}
            // `questionCount` TIDAK dipaksa sama dengan jumlah soal: kuis boleh
            // punya lebih banyak soal daripada yang dipakai bila pengacakan
            // aktif. Yang dijamin hanya rentangnya (1–50, divalidasi rules +
            // normalizeQuizSettings), jadi tidak pernah error saat dipakai.
            hint={`Soal tersedia di kuis: ${rows.length}. Nilai dipakai saat pengerjaan (acak/ sampling).`}
          />
          <Input
            label="Batas waktu (menit)"
            type="number"
            min={0}
            max={QUIZ_LIMITS.maxTimeLimitMinutes}
            value={form.settings.timeLimitMinutes}
            onChange={setSettingNumber('timeLimitMinutes')}
            disabled={locked}
            hint="0 = tanpa batas"
          />
          <Input
            label="Nilai kelulusan (%)"
            type="number"
            min={0}
            max={100}
            value={form.settings.passingScorePercent}
            onChange={setSettingNumber('passingScorePercent')}
            disabled={locked}
          />
          <Input
            label="Batas percobaan"
            type="number"
            min={1}
            max={QUIZ_LIMITS.maxAttempts}
            value={form.settings.maxAttempts}
            onChange={setSettingNumber('maxAttempts')}
            disabled={locked}
          />
          <Select
            label="Tampilkan kunci jawaban"
            value={form.settings.showAnswerMode}
            onChange={(e) => setSetting('showAnswerMode', e.target.value)}
            disabled={locked}
          >
            {Object.entries(SHOW_ANSWER_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <div className="space-y-0.5">
            <SwitchRow
              label="Acak urutan soal"
              checked={Boolean(form.settings.randomizeQuestionOrder)}
              onChange={(v) => setSetting('randomizeQuestionOrder', v)}
              disabled={locked}
            />
            <SwitchRow
              label="Acak urutan pilihan"
              checked={Boolean(form.settings.randomizeOptionOrder)}
              onChange={(v) => setSetting('randomizeOptionOrder', v)}
              disabled={locked}
            />
            <SwitchRow
              label="Tampilkan pembahasan"
              checked={Boolean(form.settings.showExplanation)}
              onChange={(v) => setSetting('showExplanation', v)}
              disabled={locked}
            />
            <SwitchRow
              label="Izinkan ulangan"
              checked={Boolean(form.settings.allowRetry)}
              onChange={(v) => setSetting('allowRetry', v)}
              disabled={locked}
            />
          </div>
        </div>
        <p className="text-[12px] text-dimmer">
          Pengaturan disimpan saat tombol Simpan ditekan — mengetik tidak menulis ke Firestore.
        </p>
      </section>


      {/* ---------- DAFTAR SOAL ---------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Soal dalam kuis ({rows.length})</h2>
          {isOwner && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEditTarget(null);
                  setQuestionFormOpen(true);
                }}
              >
                ＋ Buat Soal
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPickerOpen(true)}
                disabled={rows.length >= QUIZ_LIMITS.maxQuestions}
              >
                Tambah dari Question Bank
              </Button>
            </div>
          )}
        </div>

        {bankError && (
          <p className="rounded-smc border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-[13px] text-ink">
            Gagal memuat isi soal: {bankError.message || String(bankError)}
          </p>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon="📝"
            title="Belum Ada Soal"
            description="Tambahkan soal dari bank soal, atau buat soal baru yang otomatis masuk ke kuis ini."
            action={
              isOwner ? <Button onClick={() => setPickerOpen(true)}>Tambah dari Question Bank</Button> : undefined
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const q = row.question;
              // Rules: hanya pembuat soal yang boleh mengubah dokumen soal.
              const canEditQuestion = Boolean(q) && q.createdBy === user?.uid;
              return (
                <li key={`${row.questionId}-${row.position}`} className="card space-y-2 p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-[12px] text-dimmer">
                      {row.position + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {row.missing ? (
                        <>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="warn">Soal tidak ditemukan</Badge>
                            <span className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">
                              id {row.questionId}
                            </span>
                          </div>
                          <p className="text-[13px] leading-relaxed text-dim">
                            Soal ini tidak dapat dimuat (sudah dihapus, ada di Sampah, atau private milik
                            partner). Id-nya tetap disimpan di kuis sampai kamu mengeluarkannya sendiri.
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="accent">{QUESTION_TYPE_LABELS[q.type] || 'Pilihan Ganda'}</Badge>
                            <span className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">
                              {topicTitle(q.topicId)} · {q.points ?? 10} poin
                            </span>
                          </div>
                          <p className="line-clamp-2 text-[13.5px] leading-relaxed text-ink">{q.prompt}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
                    <Button variant="subtle" size="sm" onClick={() => setPreviewTarget(q)} disabled={row.missing}>
                      Lihat
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => {
                        setEditTarget(q);
                        setQuestionFormOpen(true);
                      }}
                      disabled={!canEditQuestion}
                      title={canEditQuestion ? undefined : 'Hanya pembuat soal yang bisa mengubah.'}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => handleMove(row, -1)}
                      disabled={locked || pending || row.position === 0}
                    >
                      ↑ Naik
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => handleMove(row, 1)}
                      disabled={locked || pending || row.position === rows.length - 1}
                    >
                      ↓ Turun
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleRemove(row)} disabled={locked || pending}>
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {missingCount > 0 && (
          <p className="text-[12px] text-warn">
            {missingCount} soal tidak dapat dimuat. Id-nya sengaja tidak dihapus otomatis agar tidak hilang
            tanpa jejak.
          </p>
        )}
      </section>


      {/* ---------- MODAL ---------- */}
      <QuestionPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleAddFromBank}
        questions={questions}
        topics={topics}
        loading={bankLoading}
        error={bankError}
        usedIds={quiz.questionIds}
      />

      <QuestionFormModal
        open={questionFormOpen}
        onClose={() => setQuestionFormOpen(false)}
        spaceId={spaceId}
        topics={topics}
        initialData={editTarget}
        onSaved={handleQuestionSaved}
      />

      <QuestionDetailModal
        open={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        question={previewTarget}
        isOwner={previewTarget?.createdBy === user?.uid}
      />
    </div>
  );
}

