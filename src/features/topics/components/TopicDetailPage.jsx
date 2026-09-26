import { IconDiscuss, IconEmptyNote } from '../../../shared/icons';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import Spinner from '../../../shared/components/Spinner';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpace } from '../../space/hooks/useSpace';
import { useUserProfile } from '../../space/hooks/useUserProfile';
import { spaceRoles } from '../../space/services/spaceService';
import { useTopics } from '../hooks/useTopics';
import { useNotes } from '../../notes/hooks/useNotes';
import { useNoteStates } from '../../notes/hooks/useNoteStates';
import { visibleActiveNotes } from '../../notes/utils/visibility';
import NoteCard from '../../notes/components/NoteCard';
import { softDeleteNote } from '../../notes/services/noteService';
import { useResources } from '../../resources/hooks/useResources';
import { visibleActiveResources } from '../../resources/utils/visibility';
import ResourcesPanel from '../../resources/components/ResourcesPanel';
import { useSpaceId } from '../../space/SpaceContext';
import { deleteTopics } from '../services/topicService';
import { descendantIds, progressStats, topicPath } from '../utils/tree';
import { statusLabel, statusTone } from '../../../shared/utils/status';
import { LEVEL_LABEL, STATUS_LABEL } from '../../../lib/constants';
import { timeAgo } from '../../../shared/utils/time';
import TopicFormModal from './TopicFormModal';
import ConfirmModal from './ConfirmModal';

const TABS = [
  { key: 'notes', icon: '📝', label: 'Notes' },
  { key: 'resources', icon: '🔗', label: 'Resources' },
  { key: 'questions', icon: '❓', label: 'Questions', placeholder: 'Segera hadir.' },
  { key: 'quiz', icon: '🧩', label: 'Quiz', placeholder: 'Segera hadir.' }
];

// Halaman detail topik: breadcrumb, batang progres, tab materi.
export default function TopicDetailPage() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const spaceId = useSpaceId();
  const toast = useToast();
  const { user } = useAuthState();
  const { data: topics, loading: topicsLoading } = useTopics(spaceId);
  const { data: notes } = useNotes(spaceId);
  const { data: states } = useNoteStates(spaceId);
  const { data: resources } = useResources(spaceId);
  const { data: space } = useSpace(spaceId);
  const roles = spaceRoles(space, user?.uid);
  const me = useUserProfile(user?.uid);
  const partner = useUserProfile(roles?.partner);

  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'notes';
  const setTab = (key) => setParams(key === 'notes' ? {} : { tab: key }, { replace: true });
  const tabRefs = useRef([]);

  const moveTab = (event, index) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    setTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  const topic = topics.find((t) => t.id === topicId);
  const crumb = useMemo(() => topicPath(topicId, topics), [topicId, topics]);

  const subtreeIds = useMemo(
    () => (topic ? [topic.id, ...descendantIds(topic.id, topics)] : []),
    [topic, topics]
  );

  const notesIn = useMemo(
    () =>
      visibleActiveNotes(notes, user?.uid)
        .filter((n) => subtreeIds.includes(n.topicId))
        .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)),
    [notes, subtreeIds, user?.uid]
  );
  const resourcesIn = useMemo(
    () =>
      visibleActiveResources(resources, user?.uid)
        .filter((r) => subtreeIds.includes(r.topicId))
        .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)),
    [resources, subtreeIds, user?.uid]
  );

  const children = useMemo(
    () =>
      topics
        .filter((t) => t.parentId === topic?.id)
        .sort((a, b) => a.order - b.order),
    [topics, topic]
  );
  // Kemajuan dihitung dari SELURUH keturunan, bukan hanya anak langsung.
  const progress = useMemo(
    () => progressStats(topics, topic?.id, topic?.status),
    [topics, topic]
  );

  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [noteConfirm, setNoteConfirm] = useState(null);

  const ownerName = (ownerId) => {
    if (!ownerId) return '—';
    if (ownerId === user?.uid) return me.data?.displayName || 'Kamu';
    if (ownerId === roles?.partner) return partner.data?.displayName || 'Partner';
    return '—';
  };

  const ownerColor = (ownerId) => {
    if (ownerId === user?.uid) return me.data?.color || '';
    if (ownerId === roles?.partner) return partner.data?.color || '';
    return '';
  };

  const openNoteDelete = (note) =>
    setNoteConfirm({
      title: `Hapus "${note.title}"?`,
      message:
        'Catatan dipindah ke Sampah (hanya terlihat olehmu). Bisa dipulihkan dari menu Learn.',
      confirmLabel: 'Hapus',
      action: () => softDeleteNote(spaceId, note.id)
    });

  const openDelete = () => {
    setConfirm({
      title: `Hapus ${(LEVEL_LABEL[topic.level] || 'topik').toLowerCase()} ini?`,
      message: `"${topic.title}"${
        children.length ? ` beserta ${children.length} subtopik di dalamnya` : ''
      } akan dihapus permanen. ${notesIn.length} catatan & ${resourcesIn.length} resource tidak ikut terhapus.`,
      confirmLabel: 'Hapus',
      action: () =>
        deleteTopics(spaceId, [topic.id, ...descendantIds(topic.id, topics)])
          .then(() => toast.success('Topik dihapus.'))
    });
  };

  if (topicsLoading && !topics.length) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  if (!topic) {
    return (
      <EmptyState
        icon={<IconDiscuss size={26} />}
        title="Topik tidak ditemukan"
        description="Topik ini mungkin sudah dihapus oleh salah satu anggota."
        action={<Link to="/roadmap"><Button variant="ghost">← Kembali ke Roadmap</Button></Link>}
      />
    );
  }

  const active = TABS.find((t) => t.key === tab);
  const levelLabel = LEVEL_LABEL[topic.level] || 'Topik';

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] uppercase tracking-[.05em] text-dimmer">
         <Link to="/roadmap" className="inline-flex min-h-[44px] items-center transition hover:text-ink">
          Roadmap
        </Link>
        {crumb.map((p, i) => {
          const last = i === crumb.length - 1;
          return (
            <span key={p.id} className="inline-flex max-w-full items-center gap-x-2">
              <span aria-hidden="true">/</span>
              {last ? (
                <span className="truncate text-ink">{p.title}</span>
              ) : (
                 <Link to={`/roadmap/${p.id}`} className="inline-flex min-h-[44px] items-center truncate transition hover:text-ink">
                  {p.title}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <section className="card space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 gap-4">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-smc border text-[24px]"
              style={{ backgroundColor: `${topic.color}22`, borderColor: topic.color }}
            >
              {topic.icon}
            </span>
            <div className="min-w-0">
              <div className="eyebrow">
                {levelLabel} · {STATUS_LABEL[topic.difficulty] || topic.difficulty}
              </div>
              <h1 className="mt-0.5 font-head text-2xl leading-tight text-ink">{topic.title}</h1>
              {topic.description && (
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-dim">{topic.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(topic.status)}>{statusLabel(topic.status)}</Badge>
                <span className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">
                  diperbarui {timeAgo(topic.updatedAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {topic.level < 2 && (
              <Button onClick={() => setForm({ initial: null, parent: topic })}>
                ＋ {LEVEL_LABEL[topic.level + 1]}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setForm({ initial: topic, parent: null })}>
              ✎ Edit
            </Button>
            <Button variant="danger" onClick={openDelete}>
              🗑 Hapus
            </Button>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Kemajuan subtopik</div>
              <div className="mt-1 font-head text-[22px] leading-none text-ink">
                {progress.completed}/{progress.total} selesai
              </div>
            </div>
            <div className="font-mono text-[12px] tracking-[.05em] text-dimmer">{progress.pct}%</div>
          </div>
          <div className="mt-3 h-[6px] w-full overflow-hidden rounded-full bg-panel2">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress.pct}%`, backgroundColor: 'var(--ok)' }}
            />
          </div>
          {progress.total === 0 && topic.level < 2 && (
            <p className="mt-3 text-[12.5px] text-dim">
              Belum ada {LEVEL_LABEL[topic.level + 1]?.toLowerCase() || 'subtopik'}. Tambahkan untuk melacak kemajuan.
            </p>
          )}
        </div>
      </section>

      <div role="tablist" aria-label="Jenis materi" className="flex border-b border-line">
        {TABS.map((t, index) => {
          const count = t.key === 'notes' ? notesIn.length : t.key === 'resources' ? resourcesIn.length : 0;
          return (
            <button
               key={t.key}
               ref={(node) => { tabRefs.current[index] = node; }}
               id={`topic-tab-${t.key}`}
               role="tab"
               aria-selected={t.key === tab}
               aria-controls="topic-tabpanel"
               tabIndex={t.key === tab ? 0 : -1}
               onClick={() => setTab(t.key)}
               onKeyDown={(event) => moveTab(event, index)}
              className={`-mb-px min-h-[44px] border-b-2 px-4 text-[13.5px] transition-colors ${
                t.key === tab
                  ? 'border-b-accent font-semibold text-ink'
                  : 'border-b-transparent text-dim hover:text-ink'
              }`}
            >
              {t.icon} {t.label}
              {count > 0 && <span className="ml-1 font-mono text-[11px] text-dimmer">{count}</span>}
            </button>
          );
        })}
      </div>

      <div id="topic-tabpanel" role="tabpanel" aria-labelledby={`topic-tab-${tab}`} tabIndex={0} className="space-y-3">
        {tab === 'notes' &&
          (notesIn.length === 0 ? (
            <EmptyState
              icon={<IconEmptyNote size={26} />}
              title="Belum ada catatan"
              description="Catatan menempel pada topik (termasuk subtopik di dalamnya)."
              action={
                <Button onClick={() => navigate(`/notes/new?topicId=${topic.id}&from=/roadmap/${topic.id}`)}>
                  ＋ Catatan
                </Button>
              }
            />
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10.5px] uppercase tracking-[.06em] text-dimmer">
                  {notesIn.length} catatan · klik judul untuk membuka
                </span>
                <Button size="sm" onClick={() => navigate(`/notes/new?topicId=${topic.id}&from=/roadmap/${topic.id}`)}>
                  ＋ Catatan
                </Button>
              </div>
              {notesIn.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  spaceId={spaceId}
                  topics={topics}
                  me={user?.uid}
                  states={states}
                  ownerName={ownerName}
                  ownerColor={ownerColor}
                  onEdit={(x) => navigate(`/notes/${x.id}?from=/roadmap/${topic.id}`)}
                  onDelete={openNoteDelete}
                />
              ))}
            </div>
          ))}

        {tab === 'resources' && (
          <ResourcesPanel scopeIds={subtreeIds} presetTopicId={topic.id} />
        )}

        {(tab === 'questions' || tab === 'quiz') && (
          <EmptyState icon={active.icon} title={active.label} description={active.placeholder} />
        )}
      </div>

      <TopicFormModal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        spaceId={spaceId}
        initial={form?.initial || null}
        parent={form?.parent || null}
        topics={topics}
      />

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title || ''}
        message={confirm?.message}
        confirmLabel="Hapus"
        danger
        onConfirm={() => confirm?.action?.()}
      />

      <ConfirmModal
        open={Boolean(noteConfirm)}
        onClose={() => setNoteConfirm(null)}
        title={noteConfirm?.title || ''}
        message={noteConfirm?.message}
        confirmLabel="Hapus"
        danger
        onConfirm={() =>
          noteConfirm?.action?.().then(() => {
            setNoteConfirm(null);
          })
        }
      />
    </div>
  );
}