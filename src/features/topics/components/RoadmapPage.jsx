import { IconArrowDown, IconArrowUp, IconChevronDown, IconChevronRight, IconEdit, IconLink, IconNotes, IconRoadmap, IconSwap, IconTrash } from '../../../shared/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../app/layout/PageHeader';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import PageLoading from '../../../shared/components/PageLoading';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useTopics } from '../hooks/useTopics';
import { useNotes } from '../../notes/hooks/useNotes';
import { visibleActiveNotes } from '../../notes/utils/visibility';
import { useResources } from '../../resources/hooks/useResources';
import { visibleActiveResources } from '../../resources/utils/visibility';
import { deleteTopics, importTemplateRoadmap, setTopicOrders } from '../services/topicService';
import {
  descendantIds,
  indexTopics,
  renumberSiblings,
  reorderSiblings,
  subtreeTotals,
  treeRoots
} from '../utils/tree';
import { statusLabel, statusTone } from '../../../shared/utils/status';
import { LEVEL_LABEL } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';
import TopicFormModal from './TopicFormModal';
import MoveTopicModal from './MoveTopicModal';
import ConfirmModal from './ConfirmModal';

function RowAction({ title, label, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      onClick={onClick}
       className={`flex h-11 min-w-11 items-center justify-center rounded-smc px-1 text-[12.5px] text-dimmer transition hover:bg-bg2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      {children}
    </button>
  );
}

function NodeRow({ node, ctx, first, last }) {
  const t = node.topic;
  const hasKids = node.children.length > 0;
  const open = ctx.expanded.has(t.id);
  const s = ctx.stats[t.id] || {};
  const label = LEVEL_LABEL[t.level] || 'Topik';
  const childLabel = LEVEL_LABEL[t.level + 1];
  const iconBg = `${t.color}22`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2 sm:px-4">
        <button
          type="button"
          aria-label={hasKids ? (open ? 'Tutup' : 'Buka') : 'Daun'}
          onClick={() => hasKids && ctx.onToggle(t.id)}
          className={`shrink-0 text-[13px] transition ${
             hasKids ? 'h-11 w-11 text-dim hover:text-ink' : 'h-11 w-11 text-dimmer'
          }`}
        >
          {hasKids ? (
            open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />
          ) : (
            <span className="text-[13px] leading-none">·</span>
          )}
        </button>

        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-smc border text-[17px]"
          style={{ backgroundColor: iconBg, borderColor: t.color }}
        >
          {t.icon}
        </span>

        <Link
          to={`/roadmap/${t.id}`}
          className="flex min-w-0 flex-1 basis-[45%] flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="truncate text-[14px] font-medium text-ink">{t.title}</span>
          <span className="font-mono text-[9.5px] uppercase leading-relaxed tracking-[.06em] text-dimmer">
            {/* Jumlah materi ikut di bawah judul agar tetap terbaca di mobile. */}
            <span className="sm:hidden inline-flex items-center gap-1">
              <IconNotes size={12} />{s.notes || 0} · <IconLink size={12} />{s.resources || 0} ·{' '}
            </span>
            {label}
          </span>
        </Link>

        <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] tracking-[.03em] text-dimmer sm:inline-flex">
          <IconNotes size={12} />{s.notes || 0} · <IconLink size={12} />{s.resources || 0}
        </span>

        <Badge tone={statusTone(t.status)}>{statusLabel(t.status)}</Badge>

        {/* Aksi tetap 44px; di layar sempit membungkus ke baris sendiri
            agar tidak ada tombol yang hilang (dulu hidden di <640/<768px). */}
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-0.5 sm:ml-auto sm:w-auto">
          {childLabel && (
            <RowAction
              title={`Buat ${childLabel.toLowerCase()}`}
              label={`Buat ${childLabel.toLowerCase()}`}
              onClick={() => ctx.onAdd(t)}
              className="text-[14px] font-semibold text-ink"
            >
              ＋
            </RowAction>
          )}
          {t.level > 0 && (
            <RowAction title="Pindahkan" label="Pindahkan topik" onClick={() => ctx.onMove(t)}>
              <IconSwap size={15} />
            </RowAction>
          )}
          {!first && (
            <RowAction title="Naik" label="Pindah urutan ke atas" onClick={() => ctx.onReorder(t, -1)}>
              <IconArrowUp size={15} />
            </RowAction>
          )}
          {!last && (
            <RowAction title="Turun" label="Pindah urutan ke bawah" onClick={() => ctx.onReorder(t, 1)}>
              <IconArrowDown size={15} />
            </RowAction>
          )}
          <RowAction title="Edit" label="Edit topik" onClick={() => ctx.onEdit(t)}>
            <IconEdit size={15} />
          </RowAction>
          <RowAction title="Hapus" label="Hapus topik" onClick={() => ctx.onDelete(t)}>
            <IconTrash size={15} />
          </RowAction>
        </div>
      </div>

      {hasKids && open && (
        <div className="ml-4 border-l border-[color-mix(in_srgb,var(--border-strong)_70%,transparent)] pl-1 sm:ml-5">
          {node.children.map((c, ci) => (
            <NodeRow
              key={c.topic.id}
              node={c}
              ctx={ctx}
              first={ci === 0}
              last={ci === node.children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Halaman Roadmap: pohon Subject → Topic → Subtopic dengan aksi kelola.
export default function RoadmapPage() {
  const spaceId = useSpaceId();
  const toast = useToast();
  const { user } = useAuthState();
  const { data: topics, loading, error } = useTopics(spaceId);
  const { data: notes } = useNotes(spaceId);
  const { data: resources } = useResources(spaceId);

  const [expanded, setExpanded] = useState(() => new Set());
  const hydrated = useRef(false);
  const [form, setForm] = useState(null); // { initial: Topic|null, parent: Topic|null }
  const [move, setMove] = useState(null); // Topic yang dipindah
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, danger, action }

  useEffect(() => {
    if (hydrated.current || loading || !topics.length) return;
    hydrated.current = true;
    const { kids } = indexTopics(topics);
    setExpanded(new Set(topics.filter((t) => kids.has(t.id)).map((t) => t.id)));
  }, [topics, loading]);

  const roots = useMemo(() => treeRoots(topics), [topics]);
  const parentIds = useMemo(() => {
    const { kids } = indexTopics(topics);
    return new Set(topics.filter((t) => kids.has(t.id)).map((t) => t.id));
  }, [topics]);

  const stats = useMemo(() => {
    const n = {};
    const r = {};
    for (const x of visibleActiveNotes(notes, user?.uid)) n[x.topicId] = (n[x.topicId] || 0) + 1;
    for (const x of visibleActiveResources(resources, user?.uid)) r[x.topicId] = (r[x.topicId] || 0) + 1;
    return { notes: subtreeTotals(topics, n), resources: subtreeTotals(topics, r) };
  }, [topics, notes, resources, user?.uid]);

  const runAction = async (fn, okMsg) => {
    try {
      await fn();
      toast.success(okMsg);
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setExpanded((prev) =>
      prev.size >= parentIds.size ? new Set() : new Set(parentIds)
    );

  const openCreate = (parent) => setForm({ initial: null, parent });
  const openEdit = (topic) => setForm({ initial: topic, parent: null });

  const doMove = (target) => {
    // Target == induk sekarang (tidak berubah): jangan hitung order baru.
    if (!move || target.id === move.parentId) {
      setMove(null);
      return;
    }
    // Level mengikuti kedalaman induk baru (tetap satu langkah di atasnya).
    const moved = { ...move, parentId: target.id, level: (target.level ?? 0) + 1 };
    const sameGroup = (pid) => topics.filter((t) => (t.parentId || '') === (pid || ''));
    // Nomor ulang grup lama (lubang order diisi) dan grup baru (topik masuk di akhir).
    const items = [
      ...renumberSiblings(sameGroup(move.parentId).filter((t) => t.id !== move.id)),
      ...renumberSiblings([...sameGroup(target.id), moved])
    ];
    runAction(() => setTopicOrders(spaceId, items), 'Topik dipindahkan.');
    setMove(null);
  };

  const reorder = (topic, dir) => {
    const siblings = topics.filter(
      (t) => (t.parentId || '') === (topic.parentId || '')
    );
    const items = reorderSiblings(siblings, topic.id, dir);
    if (!items.length) return;
    runAction(() => setTopicOrders(spaceId, items), 'Urutan diperbarui.');
  };

  const openDelete = (topic) => {
    const ids = [topic.id, ...descendantIds(topic.id, topics)];
    const nSub = ids.length - 1;
    const nNotes = stats.notes[topic.id] || 0;
    const nRes = stats.resources[topic.id] || 0;
    setConfirm({
      title: `Hapus ${(LEVEL_LABEL[topic.level] || 'topik').toLowerCase()} ini?`,
      message: (
        <div className="space-y-2">
          <p>
            "{topic.title}"{nSub > 0 ? ` beserta ${nSub} subtopik di dalamnya` : ''} akan
            dihapus permanen.
          </p>
          <p className="text-dimmer">
            {nNotes} catatan & {nRes} resource milik topik ini tidak ikut terhapus — tersimpan
            sebagai tanpa-topik di menu Learn.
          </p>
        </div>
      ),
      confirmLabel: 'Hapus',
      danger: true,
      action: () => deleteTopics(spaceId, ids)
    });
  };

  const openImport = () => {
    const hasTopics = topics.length > 0;
    setConfirm({
      title: hasTopics ? 'Tambah template ke roadmap?' : 'Impor template roadmap?',
      message: hasTopics ? (
        <>
          <p>
            Template menambah 3 topik baru di urutan terakhir: 📐 Mathematics → 📊 Probability → 🧠
            Bayes.
          </p>
          <p className="text-dimmer">
            Topik yang sudah ada tidak diubah & tidak dihapus. Kalau tidak dipakai, hapus lagi lewat
            tombol Hapus.
          </p>
        </>
      ) : (
        <p>
          Template membuat: 📐 Mathematics → 📊 Probability → 🧠 Bayes (3 level sebagai contoh).
        </p>
      ),
      confirmLabel: hasTopics ? 'Tambah' : 'Impor',
      danger: false,
      // Topik yang ada tidak dihapus; subject template ditaruh paling akhir.
      action: () => importTemplateRoadmap(spaceId, { rootOrder: topics.length })
    });
  };

  // Toast untuk aksi yang dijalankan lewat ConfirmModal (hapus/import).
  const confirmAction = async () => {
    const c = confirm;
    const okMsg = c.danger !== false ? 'Topik dihapus.' : 'Template diimpor.';
    await c.action();
    toast.success(okMsg);
  };

  const ctx = {
    expanded,
    stats,
    onToggle: toggle,
    onAdd: openCreate,
    onEdit: openEdit,
    onMove: (t) => setMove(t),
    onDelete: openDelete,
    onReorder: reorder
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="learning berdua · perencanaan"
        icon={<IconRoadmap size={26} />}
        title="Roadmap"
        description="Pohon belajar 3 level: Subject → Topic → Subtopic. Klik judul untuk halaman detail berisi Notes & Resources."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={openImport}>
              ＋ Import template roadmap
            </Button>
            <Button onClick={() => openCreate(null)}>＋ Subject</Button>
          </div>
        }
      />

      {topics.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10.5px] uppercase tracking-[.06em] text-dimmer">
            {topics.length} topik · {roots.length} subject ·{' '}
            {visibleActiveResources(resources, user?.uid).length} resource ·{' '}
            {visibleActiveNotes(notes, user?.uid).length} catatan
          </p>
          {parentIds.size > 0 && (
            <button
              type="button"
              onClick={toggleAll}
               className="min-h-[44px] text-[12.5px] text-dim underline decoration-line underline-offset-4 transition hover:text-ink"
            >
              {expanded.size >= parentIds.size ? 'Tutup semua' : 'Buka semua'}
            </button>
          )}
        </div>
      )}

      {loading && (
        <PageLoading label="Memuat roadmap…" />
      )}
      {error && <p className="text-[13.5px] text-accent">{error}</p>}

      {!loading && !error && roots.length === 0 && (
        <EmptyState
          icon={<IconRoadmap size={26} />}
          title="Roadmap masih kosong"
          description="Buat subject pertama, lalu susun topic & subtopic di bawahnya. Klik &quot;＋ Import template roadmap&quot; untuk memuat contoh 3 level."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={openImport}>
                ＋ Import template roadmap
              </Button>
              <Button onClick={() => openCreate(null)}>＋ Subject</Button>
            </div>
          }
        />
      )}

      {!loading && !error && roots.length > 0 && (
        <div className="card overflow-hidden p-0">
          {roots.map((node, i) => (
            <NodeRow
              key={node.topic.id}
              node={node}
              ctx={ctx}
              first={i === 0}
              last={i === roots.length - 1}
            />
          ))}
        </div>
      )}

      <TopicFormModal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        spaceId={spaceId}
        initial={form?.initial || null}
        parent={form?.parent || null}
        topics={topics}
      />

      <MoveTopicModal
        open={Boolean(move)}
        onClose={() => setMove(null)}
        topic={move}
        topics={topics}
        onMove={doMove}
      />

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title || ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel || 'Hapus'}
        danger={confirm?.danger !== false}
        onConfirm={confirmAction}
      />
    </div>
  );
}