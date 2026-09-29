import { IconQuestion } from '../../../shared/icons';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../../app/layout/PageHeader';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import ConfirmDialog from '../../../shared/ui/ConfirmDialog';
import PageLoading from '../../../shared/components/PageLoading';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useSpace } from '../../space/hooks/useSpace';
import { spaceRoles } from '../../space/services/spaceService';
import { useUserProfile } from '../../space/hooks/useUserProfile';
import { useTopics } from '../../topics/hooks/useTopics';
import { useQuestions } from '../hooks/useQuestions';
import { useQuestionKeys } from '../hooks/useQuestionKeys';
import {
  purgeQuestion,
  restoreQuestion,
  softDeleteQuestion
} from '../services/questionService';
import QuestionCard from './QuestionCard';
import QuestionFormModal from './QuestionFormModal';
import QuestionDetailModal from './QuestionDetailModal';
import QuestionReportModal from './QuestionReportModal';
import { QUESTION_TYPE_LABELS } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

export default function QuestionBankPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuthState();
  const spaceId = useSpaceId();
  const { data: space } = useSpace(spaceId);
  const roles = spaceRoles(space, user?.uid);
  const partner = useUserProfile(roles?.partner);

  const { data: topics = [] } = useTopics(spaceId);
  const { data: questions = [], loading, error } = useQuestions(spaceId);
  // Kunci jawaban dimuat terpisah dan HANYA untuk soal milik sendiri (policy P2).
  // Partner yang membuka kartu soal orang lain tetap tidak menerima kunci.
  const { keys: questionKeys } = useQuestionKeys(spaceId, questions);

  // Filter States
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [tab, setTab] = useState('active'); // 'active' | 'trash'

  // Modal States
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);

  const activeQuestions = useMemo(() => {
    return questions.filter((q) => !q.deletedAt);
  }, [questions]);

  const trashQuestions = useMemo(() => {
    return questions.filter((q) => q.deletedAt && q.createdBy === user?.uid);
  }, [questions, user?.uid]);

  const filteredQuestions = useMemo(() => {
    const list = tab === 'active' ? activeQuestions : trashQuestions;
    return list.filter((q) => {
      if (selectedTopic && q.topicId !== selectedTopic) return false;
      if (selectedType && q.type !== selectedType) return false;
      if (selectedDifficulty && q.difficulty !== selectedDifficulty) return false;
      if (search.trim()) {
        const queryStr = search.toLowerCase();
        const inPrompt = (q.prompt || '').toLowerCase().includes(queryStr);
        const inTags = (q.tags || []).some((t) => t.toLowerCase().includes(queryStr));
        if (!inPrompt && !inTags) return false;
      }
      return true;
    });
  }, [tab, activeQuestions, trashQuestions, selectedTopic, selectedType, selectedDifficulty, search]);

  // Aksi merusak lewat dialog yang sama dengan halaman lain (bukan
  // window.confirm) supaya tampilannya konsisten dan konsekuensinya terbaca.
  const [confirm, setConfirm] = useState(null);

  const handleTrash = async (q) => {
    setConfirm({
      title: 'Pindahkan soal ke Sampah?',
      body: `"${(q.prompt || '').slice(0, 60)}" akan dipindahkan ke Sampah. Soal bisa dipulihkan kapan saja dari tab Sampah, dan tidak ikut terhapus dari kuis yang memakainya.`,
      confirmLabel: 'Pindahkan ke Sampah',
      danger: true,
      onConfirm: async () => {
        try {
          await softDeleteQuestion(spaceId, q.id);
          toast.success('Soal dipindahkan ke Sampah.');
        } catch (err) {
          toast.error(toErrorMessage(err, 'Gagal memindahkan soal ke sampah.'));
        }
      }
    });
  };

  const handleRestore = async (q) => {
    try {
      await restoreQuestion(spaceId, q.id);
      toast.success('Soal dipulihkan.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal memulihkan soal.'));
    }
  };

  const handlePurge = async (q) => {
    setConfirm({
      title: 'Hapus soal permanen?',
      body: `"${(q.prompt || '').slice(0, 60)}" akan dihapus permanen, termasuk riwayatnya. Tindakan ini tidak bisa dibatalkan. Kalau masih diperlukan, pindahkan ke Sampah saja.`,
      confirmLabel: 'Hapus permanen',
      danger: true,
      onConfirm: async () => {
        try {
          await purgeQuestion(spaceId, q.id);
          toast.success('Soal dihapus permanen.');
        } catch (err) {
          toast.error(toErrorMessage(err, 'Gagal menghapus soal.'));
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        eyebrow="learning berdua · pustaka soal"
        icon={<IconQuestion size={26} />}
        title="Soal Tersimpan"
        description={
          <>
            <span>Semua soal yang pernah dibuat, milikmu dan partner. Bisa dipakai ulang di banyak kuis.</span>
            <span className="block mt-1 text-[12.5px] text-dimmer">
              Halaman ini adalah pustaka, bukan menu utama. Soal biasanya dibuat dari dalam Quiz Editor.{' '}
              <button
                type="button"
                onClick={() => navigate('/quiz')}
                className="underline underline-offset-2 hover:text-ink"
              >
                Buka Quiz
              </button>
            </span>
          </>
        }
        actions={
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            ＋ Buat Soal Baru
          </Button>
        }
      />

      {/* Tabs & Search Filter */}
      <div className="space-y-3">
        <div className="flex border-b border-line gap-6 text-[13.5px] font-medium">
          <button
            type="button"
            className={`pb-2.5 transition ${
              tab === 'active'
                ? 'border-b-2 border-accent text-accent font-semibold'
                : 'text-dim hover:text-ink'
            }`}
            onClick={() => setTab('active')}
          >
            Bank Soal ({activeQuestions.length})
          </button>
          <button
            type="button"
            className={`pb-2.5 transition ${
              tab === 'trash'
                ? 'border-b-2 border-accent text-accent font-semibold'
                : 'text-dim hover:text-ink'
            }`}
            onClick={() => setTab('trash')}
          >
            Sampah ({trashQuestions.length})
          </button>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          <input
            type="text"
            placeholder="Cari pertanyaan atau tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13px] text-ink"
          />

          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="min-h-[38px] rounded-smc border border-line bg-bg2 px-2 text-[13px] text-ink"
          >
            <option value="">Semua Topik</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.level === 0 ? 'Topik: ' : t.level === 1 ? '  └─ ' : '    └─ '}
                {t.title}
              </option>
            ))}
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="min-h-[38px] rounded-smc border border-line bg-bg2 px-2 text-[13px] text-ink"
          >
            <option value="">Semua Tipe Soal</option>
            {Object.entries(QUESTION_TYPE_LABELS).map(([tKey, tLabel]) => (
              <option key={tKey} value={tKey}>
                {tLabel}
              </option>
            ))}
          </select>

          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="min-h-[38px] rounded-smc border border-line bg-bg2 px-2 text-[13px] text-ink"
          >
            <option value="">Semua Kesulitan</option>
            <option value="beginner">Pemula</option>
            <option value="intermediate">Menengah</option>
            <option value="advanced">Lanjutan</option>
          </select>
        </div>
      </div>

      {/* Questions List */}
      {loading ? (
        <PageLoading label="Memuat bank soal…" />
      ) : error ? (
        <div className="p-4 rounded-smc border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-ink text-[13.5px]">
          Gagal memuat bank soal: {error.message || String(error)}
        </div>
      ) : filteredQuestions.length === 0 ? (
        <EmptyState
          title={tab === 'active' ? 'Belum Ada Soal' : 'Sampah Kosong'}
          description={
            tab === 'active'
              ? 'Belum ada soal yang sesuai dengan filter. Klik tombol di atas untuk membuat soal baru.'
              : 'Tidak ada soal yang berada di tab sampah.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredQuestions.map((q) => {
            const topic = topics.find((t) => t.id === q.topicId);
            const isOwner = q.createdBy === user?.uid;
            const ownerName = isOwner ? 'Kamu' : partner.data?.displayName || 'Partner';

            return (
              <QuestionCard
                key={q.id}
                question={q}
                topic={topic}
                isOwner={isOwner}
                ownerName={ownerName}
                trashed={tab === 'trash'}
                onPreview={(question) => setPreviewTarget(question)}
                onEdit={(question) => {
                  setEditTarget(question);
                  setFormOpen(true);
                }}
                onTrash={handleTrash}
                onRestore={handleRestore}
                onPurge={handlePurge}
                onReport={setReportTarget}
              />
            );
          })}
        </div>
      )}

      {/* Modals */}
      <QuestionFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        spaceId={spaceId}
        topics={topics}
        initialData={editTarget}
        keyData={editTarget ? questionKeys.get(editTarget.id) || null : null}
        isOwner={Boolean(editTarget && editTarget.createdBy === user?.uid)}
      />

      <QuestionDetailModal
        open={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        spaceId={spaceId}
        question={previewTarget}
        questionKey={previewTarget ? questionKeys.get(previewTarget.id) || null : null}
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

      <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
