import { IconBooks, IconEmptyNote, IconPlus, IconSearch, IconWarn } from '../../../shared/icons';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import Input from '../../../shared/ui/Input';
import Select from '../../../shared/ui/Select';
import StatusNote from '../../../shared/ui/StatusNote';
import ConfirmDialog from '../../../shared/ui/ConfirmDialog';
import PageLoading from '../../../shared/components/PageLoading';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useTopics } from '../../topics/hooks/useTopics';
import { useQuestions } from '../../questions/hooks/useQuestions';
import QuestionDetailModal from '../../questions/components/QuestionDetailModal';
import QuestionReportModal from '../../questions/components/QuestionReportModal';
import { useQuiz, useAttempts } from '../hooks/useQuizzes';
import { deleteQuiz, updateQuiz, updateQuizQuestionIds } from '../services/quizService';
import { normalizeQuizSettings } from '../utils/quizSettings';
import { ATTEMPT_STATUS, canStartNewAttempt, findInProgress } from '../utils/attemptEngine';
import {
  appendQuestionIds,
  buildEditorCards,
  buildQuizQuestionRows,
  cardKeyOf,
  cardMoveBounds,
  isDraftCardVisible,
  moveDraftCard,
  moveQuestionIdAt,
  moveQuestionIdTo,
  removeQuestionIdAt
} from '../utils/quizQuestions';
import {
  EDITOR_STATE,
  canRetryEditor,
  editorFailureMessage,
  isValidQuizId,
  resolveQuizEditorState
} from '../utils/quizEditorState';
import { emptyQuestionDraft } from '../utils/questionCard';
import QuestionPickerModal from './QuestionPickerModal';
import QuestionCard from './QuestionCard';
import { QUIZ_LIMITS, QUIZ_SETTINGS_DEFAULTS } from '../../../lib/constants';
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
//
// Alur "Buat Quiz → editor" adalah bagian wajib dari fitur: gagal membuka
// editor ditampilkan sebagai error yang jelas (lihat `utils/quizEditorState`),
// BUKAN sebagai editor kosong. Halaman ini tidak pernah membuat kuis — retry
// hanya membaca ulang dokumen yang sama, jadi tidak mungkin ada kuis duplikat.
export default function QuizEditorPage({ quiz: quizProp = null }) {
  const { quizId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const spaceId = useSpaceId();
  const { user } = useAuthState();

  // `quizId` yang dipakai membaca dokumen kuis. Id dari route dicek dulu supaya
  // path yang tidak valid tidak pernah sampai ke Firestore.
  const routeIdValid = isValidQuizId(quizId);
  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => setReloadKey((k) => k + 1);
  // Datang langsung dari "Buat Quiz"? Pesan kegagalan jadi jujur: kuis mungkin
  // sudah tercipta, jadi jangan pernah menyarankan membuat kuis kedua.
  const justCreated = Boolean(location.state?.justCreated);

  // Kalau route sudah memuat kuis (QuizRoutePage memilih tampilan berdasarkan
  // kepemilikan), listener di sini dimatikan supaya tidak ada dua listener atas
  // dokumen yang sama.
  const {
    data: fetchedQuiz,
    loading: fetching,
    error,
    errorCode
  } = useQuiz(spaceId, routeIdValid ? quizId : '', { reloadKey, enabled: !quizProp });
  const quiz = quizProp || fetchedQuiz;
  const loading = !quizProp && fetching;
  const { data: topics = [] } = useTopics(spaceId);
  // Satu listener bank soal dipakai bersama oleh baris soal DAN picker.
  const { data: questions = [], loading: bankLoading, error: bankError } = useQuestions(spaceId);
  // Riwayat attempt milik pengguna ini (rules menjadikan attempts privat).
  const { data: attempts = [] } = useAttempts(spaceId, routeIdValid ? quizId : '');
  const inProgress = findInProgress(attempts, user?.uid);

  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [pending, setPending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState(null);
  // Konfirmasi berdesain (bukan window.confirm): satu tempat untuk soal yang
  // dikeluarkan dan kuis yang dihapus.
  const [confirmAction, setConfirmAction] = useState(null);
const [reportTarget, setReportTarget] = useState(null);
  // Kartu soal baru yang belum punya id (menunggu autosave pertama).
  const [newCards, setNewCards] = useState([]);
  // id_soal -> id draft sementara. Dipakai sebagai React key supaya kartu yang
  // sama tidak remount setelah autosave pertama memberi id permanen: tanpa ini
  // state `expanded` di dalam kartu ikut hilang, jadi kartu yang sedang diisi
  // mendadak menutup tepat setelah "tersimpan".
  const [draftKeyById, setDraftKeyById] = useState({});

  // `quizId` dari route harus berupa id dokumen yang bisa dibaca. Id rusak
  // (mis. berisi `/`) diperlakukan sebagai "tidak ditemukan" — bukan loading
  // selamanya dan bukan editor kosong.
  const editorState = routeIdValid
    ? resolveQuizEditorState({ loading, error, errorCode, quiz })
    : EDITOR_STATE.notFound;

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

  // Kartu yang dirender = soal tersimpan di kuis + kartu baru yang belum punya
  // id (belum masuk `questionIds` sampai autosave pertama berhasil). Kartu baru
  // selalu di BELAKANG supaya posisinya sama sebelum dan sesudah create: kalau
  // di depan, kartu melompat ke bawah tepat setelah save.
  const cards = useMemo(() => buildEditorCards(rows, newCards), [rows, newCards]);
  // Id soal yang sudah ada di snapshot — dipakai untuk menyembunyikan entry
  // draft yang tautannya sudah selesai.
  const presentIds = useMemo(() => new Set(rows.map((r) => r.questionId)), [rows]);
  // Jumlah kartu baru yang benar-benar dirender (entry yang sudah tertaut tapi
  // barisnya belum tiba tidak ikut dihitung, supaya batas tombol panah tepat).
  const draftCount = cards.length - rows.length;

  // Entry draft yang barisnya sudah ada di snapshot dibersihkan dari state.
  // Rendernya sudah aman tanpa ini (`buildEditorCards` menyembunyikannya), jadi
  // ini murni menjaga state tetap sama dengan yang terlihat: `draftCount` selalu
  // jumlah kartu baru yang benar-benar dirender, tidak ada entry yang menumpuk.
  useEffect(() => {
    setNewCards((prev) => {
      const next = prev.filter((c) => isDraftCardVisible(c, presentIds));
      return next.length === prev.length ? prev : next;
    });
  }, [presentIds]);

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
    setConfirmAction({
      title: 'Keluarkan soal dari kuis?',
      body: `"${label}…" akan dikeluarkan dari kuis ini. Soalnya tetap tersimpan di bank soal dan bisa ditambahkan lagi kapan saja.`,
      confirmLabel: 'Keluarkan soal',
      onConfirm: () => mutateIds(removeQuestionIdAt(quiz.questionIds, row.position), 'Soal dikeluarkan dari kuis.')
    });
  };

  // ---- Kartu inline (gaya Google Forms) ----------------------------------
  // Kartu yang belum punya id soal (baru dibuat lewat "+ Soal Baru") disimpan
  // di state lokal. Id aslinya baru ada setelah autosave pertama berhasil,
  // lalu kartu itu masuk `questionIds` lewat `handleCardSaved`.

  // Draft kartu yang sudah tersimpan di Firestore diambil dari dokumen soal.
  const draftOf = (row) => {
    const q = row.question;
    if (q) return { ...q, questionId: q.id };
    const local = newCards.find((c) => c.questionId === row.questionId);
    if (local) return local.draft;
    return { ...emptyQuestionDraft(quiz?.topicId || topics[0]?.id || ''), questionId: row.questionId };
  };

  const addInlineCard = () => {
    if (!quiz) return;
    const questionId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Selalu append: kartu baru muncul di paling bawah, bukan di paling atas.
    setNewCards((prev) => [
      ...prev,
      {
        questionId,
        // Berisi setelah autosave pertama berhasil; dipakai untuk menyembunyikan
        // entry ini begitu barisnya muncul di snapshot.
        realId: null,
        // Default soal baru: Pilihan Ganda (tipe paling umum), langsung expanded
        // dan fokus ke input pertanyaan.
        draft: { ...emptyQuestionDraft(quiz.topicId || topics[0]?.id || ''), questionId },
        focus: true
      }
    ]);
  };

  // Kartu baru selesai autosave pertama → tautkan ke kuis (questionIds) di
  // UJUNG, supaya soal baru masuk paling bawah — sama seperti "Dari Bank Soal".
  //
  // Entry draft TIDAK dihapus di sini. `buildEditorCards` menyembunyikannya begitu
  // baris dengan `realId`-nya muncul di snapshot, jadi satu soal tidak pernah
  // tampil dua kali dan kartu tidak pernah hilang lalu muncul lagi. `draftKeyById`
  // menahan id draft sebagai React key, jadi kartu yang sama hanya diperbarui
  // (bukan remount) — inilah yang menjaga posisi, state expanded, dan fokus.
  const handleCardSaved = async (cardKey, realId) => {
    if (!realId) return;
    setNewCards((prev) => prev.map((c) => (c.questionId === cardKey ? { ...c, realId, focus: false } : c)));
    setDraftKeyById((prev) => ({ ...prev, [realId]: cardKey }));
    if (!quiz) return;
    setPending(true);
    try {
      await updateQuizQuestionIds(spaceId, quiz.id, appendQuestionIds(quiz.questionIds, [realId]));
      toast.success('Soal ditambahkan ke kuis.');
    } catch (e) {
      // Kartu sengaja tetap terlihat: dokumen soal sudah aman di bank soal, dan
      // user masih bisa mengeditnya atau menambahkannya lewat Bank Soal.
      toast.error(toErrorMessage(e, 'Gagal menautkan soal ke kuis. Soal tetap tersimpan di bank soal.'));
    } finally {
      setPending(false);
    }
  };

  // Duplikat: menyalin isi soal ke kartu baru (dokumen baru dibuat sendiri
  // saat autosave, jadi tidak berbagi id dengan aslinya).
  const handleDuplicate = (row) => {
    if (!quiz || !row.question) return;
    const questionId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { id, createdBy, createdAt, updatedAt, commentCount, deletedAt, ...rest } = row.question;
    setNewCards((prev) => [
      ...prev,
      {
        questionId,
        realId: null,
        draft: { ...rest, questionId, prompt: `${rest.prompt} (salinan)` },
        focus: true
      }
    ]);
  };

  // Reorder dari drag handle. Memakai util yang sudah ada (`moveQuestionIdTo`)
  // supaya tidak ada logika urutan kedua.
  //
  // Indeks dari drag adalah indeks di `cards`, sedangkan yang ditulis adalah
  // `quiz.questionIds`. Jadi indeks kartu WAJIB dipetakan ke `position` (indeks
  // di questionIds) dulu — memakai indeks kartu langsung akan menimpa soal yang
  // salah begitu ada satu kartu baru. Kartu yang belum punya id soal
  // (`position == null`) tidak bisa dipetakan ke `questionIds`, jadi tidak
  // dipindahkan lewat drag; posisinya digeser lewat tombol panah.
  const handleReorder = (from, to) => {
    if (!quiz || locked) return;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    const fromCard = cards[from];
    const toCard = cards[to];
    if (!fromCard || !toCard) return;
    if (fromCard.position == null || toCard.position == null) return;
    mutateIds(moveQuestionIdTo(quiz.questionIds, fromCard.position, toCard.position));
  };

  // Tombol panah Naik/Turun: satu langkah, lewat util yang sama dengan drag
  // (`moveQuestionIdAt`), jadi hasilnya tidak mungkin beda.
  // Kartu baru (belum punya id soal) hanya boleh digeser di dalam blok kartu
  // baru — ia belum ada di `questionIds` sampai autosave pertama berhasil.
  const handleMoveStep = (row, delta) => {
    if (!quiz || locked) return;
    if (row.position == null) {
      const next = moveDraftCard(newCards, row.questionId, delta, presentIds);
      if (next === newCards) return;
      setNewCards(next);
      return;
    }
    mutateIds(moveQuestionIdAt(quiz.questionIds, row.position, delta));
  };

  // Batas tombol panah per kartu, supaya tidak ada tombol mati. Sumber
  // perhitungannya satu util yang sama dengan logikanya di atas.
  const moveBounds = (row) => cardMoveBounds(row, { questionIds: quiz?.questionIds, draftCount });

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

  const handleDelete = async () => {
    if (!quiz) return;
    setConfirmAction({
      title: 'Hapus kuis?',
      body: `Kuis "${quiz.title}" akan dihapus. Soal-soalnya tetap ada di bank soal, begitu juga riwayat attempt milikmu.`,
      confirmLabel: 'Hapus kuis',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteQuiz(spaceId, quiz.id);
          toast.success('Kuis dihapus.');
          navigate('/quiz');
        } catch (e) {
          toast.error(toErrorMessage(e, 'Gagal menghapus kuis.'));
        }
      }
    });
  };

  // Mulai (atau lanjutkan) pengerjaan. Attempt dibuat oleh halaman attempt
  // agar snapshot soal tercatat di server saat pengerjaan benar-benar dimulai.
  const handleStartAttempt = () => {
    navigate(`/quiz/${quizId}/attempt`);
  };

  // ---------- states halaman ----------
  // Gagal membuka editor = ERROR KRITIS, bukan warning: tidak boleh pernah
  // menampilkan editor kosong seolah-olah berhasil. Semua state memakai
  // EmptyState yang sudah ada (pola yang sama dengan halaman lain).
  if (editorState === EDITOR_STATE.loading) {
    return <PageLoading label="Memuat editor…" />;
  }

  if (editorState !== EDITOR_STATE.ready) {
    const message = editorFailureMessage(editorState, { justCreated });
    const detail = error ? String(error.message || error) : '';
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/quiz')}>
          ← Kembali ke daftar kuis
        </Button>
        <EmptyState
          icon={
            editorState === EDITOR_STATE.notFound ? <IconSearch size={26} /> : <IconWarn size={26} />
          }
          title={message.title}
          description={detail ? `${message.description} (${detail})` : message.description}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {canRetryEditor(editorState) && (
                <Button onClick={retry} title="Baca ulang dokumen kuis yang sama">
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

  if (!form) {
    return <PageLoading label="Menyiapkan form…" />;
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
                saveError ? 'text-danger' : dirty ? 'text-warn' : 'text-dimmer'
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
            {missingCount > 0 && (
              <Badge tone="warn">
                {missingCount} soal tidak ditemukan
              </Badge>
            )}
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

      {/* ---------- MULAI / RIWAYAT ATTEMPT (CP2) ---------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Pengerjaan</h2>
          <div className="flex items-center gap-2">
            <Badge tone="dim">
              {attempts.length} / {quiz.settings?.maxAttempts ?? 3} percobaan
            </Badge>
            <Button
              size="sm"
              disabled={rows.length === 0 || !canStartNewAttempt(attempts, quiz.settings?.maxAttempts, quiz.settings?.allowRetry)}
              title={
                rows.length === 0
                  ? 'Tambahkan minimal satu soal sebelum mengerjakan kuis.'
                  : attempts.length > 0
                    ? 'Mulai percobaan baru. Percobaan yang sedang berjalan akan dilanjutkan.'
                    : undefined
              }
              onClick={handleStartAttempt}
            >
              {inProgress ? 'Lanjutkan' : 'Mulai kuis'}
            </Button>
          </div>
        </div>

        {attempts.length === 0 ? (
          <p className="text-[13px] text-dimmer">Belum ada percobaan.</p>
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
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-ink">
                      {a.status === ATTEMPT_STATUS.inProgress ? 'Sedang berjalan' : `${a.scorePercent}%`}
                    </span>
                    <span className="block text-[12px] text-dimmer">{timeAgo(a.startedAt)}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {a.passed && <Badge tone="ok">Lulus</Badge>}
                    <Badge
                      tone={
                        a.status === ATTEMPT_STATUS.inProgress
                          ? 'accent'
                          : a.status === ATTEMPT_STATUS.pendingManualGrade
                            ? 'warn'
                            : 'dim'
                      }
                    >
                      {a.status === ATTEMPT_STATUS.inProgress
                        ? 'Berjalan'
                        : a.status === ATTEMPT_STATUS.pendingManualGrade
                          ? 'Menunggu nilai'
                          : a.status === ATTEMPT_STATUS.graded
                            ? 'Dinilai'
                            : 'Selesai'}
                    </Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {locked && (
        <p className="rounded-smc border border-line bg-bg2 px-3 py-2 text-[13px] text-dim">
          Kamu adalah partner pembuat kuis ini, jadi isinya hanya bisa dibaca. Minta pembuat kuis untuk
          mengubahnya.
        </p>
      )}

      {saveError && !locked && (
        <StatusNote tone="danger">
          {saveError} Perubahanmu belum tersimpan — perbaiki lalu tekan Simpan lagi.
        </StatusNote>
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


      {/* ---------- DAFTAR SOAL (kartu inline, gaya Google Forms) ---------- */}
      {/* Tanpa modal wizard: tiap soal = satu kartu yang bisa diedit di tempat
          dan autosave sendiri. "Dari Bank Soal" tetap memakai QuestionPicker
          yang sudah ada (alurnya tidak berubah). */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Daftar soal ({cards.length})</h2>
          {isOwner && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-dimmer">
              {cards.length}/{QUIZ_LIMITS.maxQuestions}
            </span>
          )}
        </div>

        {cards.length === 0 ? (
          <EmptyState
            icon={<IconEmptyNote size={26} />}
            title="Belum ada soal. Buat soal pertama untuk quiz ini."
            description="Klik + Soal Baru di bawah — soal langsung tersimpan otomatis dan masuk di bagian paling bawah daftar ini."
          />
        ) : (
          <ul className="space-y-3">
            {cards.map((row, i) => {
              const bounds = moveBounds(row);
              return (
                <QuestionCard
                  key={cardKeyOf(row, draftKeyById)}
                  draft={draftOf(row)}
                  questionId={row.position == null ? null : row.questionId}
                  index={i}
                  total={cards.length}
                  topics={topics}
                  spaceId={spaceId}
                  locked={locked}
                  draggable={isOwner}
                  canMoveUp={bounds.up}
                  canMoveDown={bounds.down}
                  autoFocus={Boolean(row.focus)}
                  onSaved={(newId) => handleCardSaved(row.questionId, newId)}
                  onRemove={() => handleRemove(row)}
                  onDuplicate={() => handleDuplicate(row)}
                  onReport={
                    // Hanya soal milik partner yang sudah tersimpan (draft punya
                    // `question: null`) - rules menolak report atas soal sendiri.
                    row.question && row.question.createdBy !== user?.uid
                      ? () => setReportTarget(row.question)
                      : undefined
                  }
                  onMove={isOwner ? handleReorder : undefined}
                  onMoveStep={isOwner ? (delta) => handleMoveStep(row, delta) : undefined}
                />
              );
            })}
          </ul>
        )}

        {/* Footer: dua cara menambah soal. */}
        {isOwner && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={addInlineCard}
              disabled={cards.length >= QUIZ_LIMITS.maxQuestions}
              title={
                cards.length >= QUIZ_LIMITS.maxQuestions
                  ? `Kuis sudah mencapai batas ${QUIZ_LIMITS.maxQuestions} soal.`
                  : 'Soal baru muncul di bagian paling bawah daftar.'
              }
            >
              <IconPlus size={15} /> Soal Baru
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPickerOpen(true)}
              disabled={cards.length >= QUIZ_LIMITS.maxQuestions}
            >
              <IconBooks size={15} /> Dari Bank Soal
            </Button>
          </div>
        )}

        {isOwner && (
          <p className="text-[12px] text-dimmer">
            Perubahan tiap soal tersimpan otomatis. Soal baru dan soal dari Bank Soal selalu masuk di
            bagian paling bawah daftar. Soal tetap bisa dipakai lagi di kuis lain.{' '}
            <button
              type="button"
              onClick={() => navigate('/questions')}
              className="underline underline-offset-2 hover:text-ink"
            >
              Lihat semua soal tersimpan
            </button>
          </p>
        )}

      </section>


      {/* ---------- MODAL ---------- */}
      {/* "Dari Bank Soal" memakai QuestionPickerModal yang sudah ada — alurnya
          tidak berubah. Kartu soal inline menggantikan modal wizard. */}
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

      <QuestionDetailModal
        open={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        spaceId={spaceId}
        question={previewTarget}
        isOwner={previewTarget?.createdBy === user?.uid}
        onReport={(q) => {
          setPreviewTarget(null);
          setReportTarget(q);
        }}
      />

      <QuestionReportModal
        open={Boolean(reportTarget)}
        spaceId={spaceId}
        question={reportTarget}
        onClose={() => setReportTarget(null)}
      />

      {/* Konfirmasi untuk aksi merusak (keluarkan soal / hapus kuis). */}
      <ConfirmDialog action={confirmAction} onClose={() => setConfirmAction(null)} />
    </div>
  );
}

