# Checkpoint 3 — Roadmap / Topik (pohon 3 level)

Tanggal: **2026-09-25** · Status: **SELESAI** (`npm run build` ✓ hijau, 103 modul)

Scope sesuai keputusan 2026-09-25: Roadmap = **pohon Subject → Topic → Subtopic** dengan expand/collapse + alur vertikal, CRUD lengkap (tambah/ubah/hapus/pindah/urutkan), halaman detail ber-tab (Notes | Resources | Questions/Quiz placeholder), dan tombol "Import template" (Mathematics → Probability → Bayes). Tanpa heatmap/chart/badge (tetap "Segera hadir").

---

## 1. Daftar file (dibuat/Diubah)

| File | Aksi |
|---|---|
| `src/features/topics/services/topicService.js` | Baru — CRUD topik, batch urutan/pindah, cascade delete, import template |
| `src/features/topics/hooks/useTopics.js` | Baru — subscribe live koleksi `topics` |
| `src/features/notes/hooks/useNotes.js` | Baru — subscribe live koleksi `notes` (dipakai hitung materi) |
| `src/features/resources/hooks/useResources.js` | Baru — subscribe live koleksi `resources` (dipakai hitung materi) |
| `src/features/topics/utils/tree.js` | Baru — index, build pohon, descendants, path, subtree totals |
| `src/features/topics/components/TopicFormModal.jsx` | Baru — form buat/edit topik (judul, ikon, warna, status, difficulty, deskripsi) |
| `src/features/topics/components/MoveTopicModal.jsx` | Baru — pindahkan topik ke induk lain (level dipertahankan) |
| `src/features/topics/components/ConfirmModal.jsx` | Baru — konfirmasi destruktif generik (busy + error inline) |
| `src/features/topics/components/RoadmapPage.jsx` | Ditulis ulang — pohon expand/collapse + aksi per node |
| `src/features/topics/components/TopicDetailPage.jsx` | Baru — breadcrumb, header, batang progres, tab materi |
| `src/shared/ui/Select.jsx` | Baru — `<select>` berlabel (gaya Input) |
| `src/shared/utils/status.js` | Baru — `statusTone` (peta status→tone Badge) + `statusLabel` |
| `src/lib/constants.js` | Diubah — tambah `LEVEL_LABEL` (0: Subject, 1: Topic, 2: Subtopic) |
| `src/app/layout/AppShell.jsx` | Diubah — rute baru `/roadmap/:topicId` → `TopicDetailPage` |

**Tidak ada perubahan** pada `firestore.rules` (aturan topics sudah ada dari CP1) → tidak perlu `npm run test:rules`. Hook memakai `onSnapshot` **tanpa** `orderBy` (dataset kecil, urutan disortir client) sehingga tidak bergantung pada indeks komposit emulator.

---

## 2. Kode lengkap tiap file

> Catatan: logika & JSX identik dengan file sumber.

### `src/lib/constants.js` (tambahan)

```js
// Label level pohon roadmap.
export const LEVEL_LABEL = { 0: 'Subject', 1: 'Topic', 2: 'Subtopic' };
```

### `src/shared/utils/status.js`

```js
import { STATUS_LABEL } from '../../lib/constants';

// Warna badge sesuai status (tone Tailwind semantic: ok/warn/accent/dim).
export function statusTone(status) {
  return (
    {
      not_started: 'dim',
      learning: 'warn',
      completed: 'ok',
      draft: 'dim',
      shared: 'accent',
      reviewed: 'ok',
      needs_revision: 'warn',
      reading: 'warn'
    }[status] || 'dim'
  );
}

export function statusLabel(status) {
  return STATUS_LABEL[status] || status || '—';
}
```

### `src/shared/ui/Select.jsx`

```jsx
export default function Select({ label, value, onChange, children, className = '', id, ...rest }) {
  const selectId = id || (label ? `field-${label.toLowerCase().replace(/\W+/g, '-')}` : undefined);
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={selectId} className="eyebrow block">{label}</label>
      )}
      <select id={selectId} value={value} onChange={onChange}
        className="min-h-[44px] w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[14px] text-ink transition focus:outline-2 focus:outline-offset-1 focus:outline-accent"
        {...rest}>
        {children}
      </select>
    </div>
  );
}
```

### `src/features/topics/services/topicService.js`

```js
import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COL, IDENTITY, ROOT, SCHEMA_VERSION } from '../../../lib/constants';

function requireUser() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Anda belum masuk.');
  return uid;
}

function topicDoc(uid, input, parentId, level, order) {
  return {
    title: String(input.title || '').trim().slice(0, 200),
    description: String(input.description || '').trim().slice(0, 2000),
    icon: String(input.icon || '').trim().slice(0, 8) || '📄',
    color: input.color || IDENTITY.defaultColor,
    parentId: parentId ?? null,
    level,
    order,
    status: input.status || 'not_started',
    difficulty: input.difficulty || 'beginner',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  };
}

export async function createTopic(spaceId, { parentId = null, level = 0, order = 0, ...input }) {
  const uid = requireUser();
  const ref = doc(collection(db, ROOT.spaces, spaceId, COL.topics));
  await setDoc(ref, topicDoc(uid, input, parentId, level, order));
  return ref.id;
}

// Update parsial; rules melihat hasil-merge penuh. createdBy/createdAt tidak dikirim.
export async function updateTopic(spaceId, topicId, patch) {
  const ref = doc(db, ROOT.spaces, spaceId, COL.topics, topicId);
  await updateDoc(ref, { ...patch, schemaVersion: SCHEMA_VERSION, updatedAt: serverTimestamp() });
}

// Hapus cascade beberapa topik sekaligus (induk + seluruh subtopiknya).
export async function deleteTopics(spaceId, ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const batch = writeBatch(db);
  for (const id of ids) batch.delete(doc(db, ROOT.spaces, spaceId, COL.topics, id));
  await batch.commit();
}

// Ubah parent & urutan sejumlah topik dalam satu batch (pindah/urutkan).
export async function setTopicOrders(spaceId, items) {
  if (!items?.length) return;
  const batch = writeBatch(db);
  for (const it of items) {
    batch.update(doc(db, ROOT.spaces, spaceId, COL.topics, it.id), {
      parentId: it.parentId ?? null,
      level: it.level,
      order: it.order,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: serverTimestamp()
    });
  }
  await batch.commit();
}

// Seed template: Mathematics → Probability → Bayes.
export async function importTemplateRoadmap(spaceId) {
  const uid = requireUser();
  const batch = writeBatch(db);
  const col = collection(db, ROOT.spaces, spaceId, COL.topics);
  const mathId = doc(col).id;
  const probId = doc(col).id;
  const bayesId = doc(col).id;
  const mk = (id, data) => batch.set(doc(col, id), { ...data, createdBy: uid, schemaVersion: SCHEMA_VERSION });

  mk(mathId, {
    title: 'Mathematics', description: 'Bidang dasar matematika: aljabar, kalkulus, kalkulus probabilitas.',
    icon: '📐', color: '#c08a6a', parentId: null, level: 0, order: 0, status: 'learning', difficulty: 'beginner',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  mk(probId, {
    title: 'Probability', description: 'Pengantar peluang: ruang sampel, kejadian, dan distribusi.',
    icon: '📊', color: '#d9a441', parentId: mathId, level: 1, order: 0, status: 'not_started', difficulty: 'beginner',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  mk(bayesId, {
    title: 'Bayes', description: 'Teorema Bayes, probabilitas bersyarat, dan aplikasinya.',
    icon: '🧠', color: '#7aa89a', parentId: probId, level: 2, order: 0, status: 'not_started', difficulty: 'intermediate',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });

  await batch.commit();
  return [mathId, probId, bayesId];
}
```

### `src/features/topics/hooks/useTopics.js` (pola sama untuk useNotes/useResources)

```js
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

// Subscribe koleksi topik ruang; urutan disortir client (dataset kecil, 2 orang).
export function useTopics(spaceId) {
  const [state, setState] = useState({ data: [], loading: Boolean(spaceId), error: null });
  useEffect(() => {
    if (!spaceId) return undefined;
    const q = collection(db, ROOT.spaces, spaceId, COL.topics);
    const un = onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null }),
      (err) => setState((s) => ({ ...s, loading: false, error: toErrorMessage(err) }))
    );
    return un;
  }, [spaceId]);
  return state;
}
```

`useNotes` (di `src/features/notes/hooks/useNotes.js`) dan `useResources` (di `src/features/resources/hooks/useResources.js`) identik — hanya mengganti `COL.topics` → `COL.notes` / `COL.resources`.

### `src/features/topics/utils/tree.js`

```js
// Index byId + peta anak (sudah terurut order).
export function indexTopics(topics = []) {
  const byId = new Map();
  const kids = new Map();
  for (const t of topics) {
    byId.set(t.id, t);
    const pid = t.parentId || '';
    if (!kids.has(pid)) kids.set(pid, []);
    kids.get(pid).push(t);
  }
  for (const arr of kids.values()) arr.sort((a, b) => a.order - b.order);
  return { byId, kids };
}

// Akar-akaran pohon (level 0 + topik yatim); children direkursi.
export function treeRoots(topics = []) {
  const { byId, kids } = indexTopics(topics);
  const build = (arr) => arr.map((t) => ({ topic: t, children: build(kids.get(t.id) || []) }));
  const roots = [...(kids.get('') || [])];
  for (const t of topics) {
    if (t.parentId && !byId.has(t.parentId) && !roots.includes(t)) roots.push(t);
  }
  return build(roots);
}

// Semua id keturunan topicId (tanpa topicId sendiri).
export function descendantIds(topicId, topics = []) {
  const { kids } = indexTopics(topics);
  const out = [];
  const stack = [topicId];
  while (stack.length) {
    const id = stack.pop();
    for (const c of kids.get(id) || []) {
      out.push(c.id);
      stack.push(c.id);
    }
  }
  return out;
}

// Jalur dari akar ke topicId: [subject, ...topic] — dipakai breadcrumb.
export function topicPath(topicId, topics = []) {
  const { byId } = indexTopics(topics);
  const path = [];
  let cur = byId.get(topicId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return path;
}

// Total materi per topik (termasuk seluruh keturunan).
// counter = Map topicId -> jumlah (notes/resource) langsung.
export function subtreeTotals(topics = [], counter = {}) {
  const { kids } = indexTopics(topics);
  const sum = (id) => {
    let total = counter[id] || 0;
    for (const c of kids.get(id) || []) total += sum(c.id);
    return total;
  };
  const map = {};
  for (const t of topics) map[t.id] = sum(t.id);
  return map;
}
```

### `src/features/topics/components/ConfirmModal.jsx`

```jsx
import { useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';

// Konfirmasi destruktif (hapus/pindah). message boleh string atau node JSX.
export default function ConfirmModal({ open, onClose, title, message, confirmLabel = 'Hapus', danger = true, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async () => {
    setBusy(true); setError(null);
    try { await onConfirm?.(); onClose(); }
    catch (e) { setError(e?.message || 'Gagal menjalankan aksi.'); }
    finally { setBusy(false); }
  };
  return (
    <Modal
      open={open} onClose={onClose} title={title}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={run} loading={busy}>{confirmLabel}</Button>
      </>}
    >
      <div className="space-y-3">
        {typeof message === 'string' ? <p className="text-[13.5px] leading-relaxed text-dim">{message}</p> : message}
        {error && <p className="text-[12.5px] text-accent">{error}</p>}
      </div>
    </Modal>
  );
}
```

### `src/features/topics/components/MoveTopicModal.jsx`

```jsx
import { useMemo, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import { descendantIds } from '../utils/tree';
import { LEVEL_LABEL } from '../../../lib/constants';

// Pindahkan topik ke subject/induk lain (level dipertahankan).
export default function MoveTopicModal({ open, onClose, onMove, topic, topics }) {
  const [selected, setSelected] = useState(null);
  const candidates = useMemo(() => {
    if (!topic) return [];
    const excluded = new Set([topic.id, ...descendantIds(topic.id, topics)]);
    return topics.filter((t) => t.level === topic.level - 1 && !excluded.has(t.id)).sort((a, b) => a.order - b.order);
  }, [topic, topics]);
  if (!topic) return null;
  const levelLabel = LEVEL_LABEL[topic.level + 1] || 'Topik';
  return (
    <Modal
      open={open} onClose={onClose} title={`Pindahkan ${levelLabel.toLowerCase()}`} subtitle={topic.title}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={() => selected && onMove(selected)} disabled={!selected}>Pindah</Button>
      </>}
    >
      {candidates.length === 0 ? (
        <p className="text-[13.5px] leading-relaxed text-dim">
          Tidak ada induk valid sebagai tujuan pindah.
          {topic.level === 1 && ' Subject hanya bisa ditaruh sebagai akar (tidak dipindah).'}
        </p>
      ) : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          <p className="text-[12.5px] text-dimmer">Pilih {LEVEL_LABEL[topic.level - 1].toLowerCase()} baru & topik akan ditaruh paling bawah.</p>
          {candidates.map((c) => {
            const checked = selected?.id === c.id;
            return (
              <label key={c.id}
                className={`flex cursor-pointer items-start gap-3 rounded-smc border px-3 py-2.5 transition ${checked ? 'border-ink bg-bg2' : 'border-line hover:border-linestrong'}`}>
                <input type="radio" name="move-parent" checked={checked} onChange={() => setSelected(c)} className="mt-0.5 accent-[var(--accent)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    <span className="mr-1.5" style={{ color: c.color }}>{c.icon}</span>{c.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">{LEVEL_LABEL[c.level]}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
```

### `src/features/topics/components/TopicFormModal.jsx`

```jsx
import { useEffect, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import Select from '../../../shared/ui/Select';
import { createTopic, updateTopic } from '../services/topicService';
import { IDENTITY, LEVEL_LABEL, STATUS, STATUS_LABEL } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

// Form buat/edit topik. initial null = mode buat (parent menentukan level/akar).
export default function TopicFormModal({ open, onClose, spaceId, initial = null, parent = null, topics = [] }) {
  const empty = { title: '', description: '', icon: '', color: parent?.color || IDENTITY.defaultColor, status: 'not_started', difficulty: 'beginner' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(initial
        ? { title: initial.title || '', description: initial.description || '', icon: initial.icon || '', color: initial.color || IDENTITY.defaultColor, status: initial.status || 'not_started', difficulty: initial.difficulty || 'beginner' }
        : empty);
      setError(null); setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, parent]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const mode = initial ? `Edit ${(LEVEL_LABEL[initial.level] || 'Topik').toLowerCase()}` : `Buat ${(LEVEL_LABEL[parent ? parent.level + 1 : 0] || 'Topik').toLowerCase()}`;

  const save = async () => {
    const title = form.title.trim();
    if (!title) { setError('Judul wajib diisi.'); return; }
    setBusy(true); setError(null);
    try {
      const payload = { title, description: form.description.trim(), icon: form.icon.trim(), color: form.color, status: form.status, difficulty: form.difficulty };
      if (initial) await updateTopic(spaceId, initial.id, payload);
      else {
        const parentId = parent ? parent.id : null;
        const level = parent ? parent.level + 1 : 0;
        const order = topics.filter((t) => (t.parentId || '') === (parentId || '')).length;
        await createTopic(spaceId, { parentId, level, order, ...payload });
      }
      onClose();
    } catch (e) { setError(toErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      open={open} onClose={onClose} title={mode}
      subtitle={initial ? initial.title : parent ? `Di bawah ${LEVEL_LABEL[parent.level].toLowerCase()} "${parent.title}"` : `${LEVEL_LABEL[0]} tingkat atas (akar roadmap)`}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
        <Button onClick={save} loading={busy}>Simpan</Button>
      </>}
    >
      <div className="space-y-4">
        <Input label="Judul" value={form.title} onChange={set('title')} maxLength={200} autoFocus error={error && !form.title ? 'Judul wajib diisi.' : undefined} />
        <div>
          <label className="eyebrow block" htmlFor="topic-desc">Deskripsi</label>
          <textarea id="topic-desc" rows={3} value={form.description} onChange={set('description')} maxLength={2000}
            className="mt-1.5 w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[14px] text-ink placeholder:text-dimmer transition focus:outline-2 focus:outline-offset-1 focus:outline-accent"
            placeholder="Bidang, tujuan, atau hal yang akan dipelajari…" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Ikon" value={form.icon} onChange={set('icon')} maxLength={8} placeholder="📄" hint="Emoji" />
          <Select label="Status" value={form.status} onChange={set('status')}>
            {STATUS.topic.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </div>
        <Select label="Tingkat kesulitan" value={form.difficulty} onChange={set('difficulty')}>
          {STATUS.difficulty.map((d) => <option key={d} value={d}>{STATUS_LABEL[d]}</option>)}
        </Select>
        <div className="space-y-1.5">
          <span className="eyebrow block">Warna</span>
          <div className="flex flex-wrap gap-2">
            {IDENTITY.colors.map((c) => (
              <button key={c} type="button" aria-label={`Warna ${c}`} onClick={() => set('color')({ target: { value: c } })}
                className={`h-7 w-7 rounded-full border-2 transition ${form.color === c ? 'scale-110 border-ink' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        {error && !(!form.title && error === 'Judul wajib diisi.') && <p className="text-[12.5px] text-accent">{error}</p>}
      </div>
    </Modal>
  );
}
```

### `src/features/topics/components/RoadmapPage.jsx`

```jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import Spinner from '../../../shared/components/Spinner';
import { useToast } from '../../../shared/components/ToastProvider';
import { useTopics } from '../hooks/useTopics';
import { useNotes } from '../../notes/hooks/useNotes';
import { useResources } from '../../resources/hooks/useResources';
import { deleteTopics, importTemplateRoadmap, setTopicOrders } from '../services/topicService';
import { descendantIds, indexTopics, subtreeTotals, treeRoots } from '../utils/tree';
import { statusLabel, statusTone } from '../../../shared/utils/status';
import { LEVEL_LABEL } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';
import TopicFormModal from './TopicFormModal';
import MoveTopicModal from './MoveTopicModal';
import ConfirmModal from './ConfirmModal';

function RowAction({ title, label, onClick, children, className = '' }) {
  return (
    <button type="button" title={title} aria-label={label} onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center rounded-smc px-1 text-[12.5px] text-dimmer transition hover:bg-bg2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent ${className}`}>
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
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 sm:px-4">
        <button type="button" aria-label={hasKids ? (open ? 'Tutup' : 'Buka') : 'Daun'} onClick={() => hasKids && ctx.onToggle(t.id)}
          className={`shrink-0 text-[13px] transition ${hasKids ? 'h-7 w-7 text-dim hover:text-ink' : 'h-6 w-6 text-dimmer'}`}>
          {hasKids ? (open ? '▾' : '▸') : '·'}
        </button>
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-smc border text-[17px]"
          style={{ backgroundColor: iconBg, borderColor: t.color }}>
          {t.icon}
        </span>
        <Link to={`/roadmap/${t.id}`} className="flex min-w-0 flex-1 flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span className="truncate text-[14px] font-medium text-ink">{t.title}</span>
          <span className="font-mono text-[9.5px] uppercase leading-relaxed tracking-[.06em] text-dimmer">{label}</span>
        </Link>
        <span className="hidden shrink-0 font-mono text-[10px] tracking-[.03em] text-dimmer sm:inline">📝{s.notes || 0} · 🔗{s.resources || 0}</span>
        <Badge tone={statusTone(t.status)}>{statusLabel(t.status)}</Badge>
        <div className="flex shrink-0 items-center gap-0.5">
          {childLabel && (
            <RowAction title={`Buat ${childLabel.toLowerCase()}`} label={`Buat ${childLabel.toLowerCase()}`} onClick={() => ctx.onAdd(t)} className="text-[14px] font-semibold text-ink">＋</RowAction>
          )}
          {t.level > 0 && (
            <RowAction title="Pindahkan" label="Pindahkan topik" onClick={() => ctx.onMove(t)} className="hidden sm:flex">⇄</RowAction>
          )}
          {!first && (
            <RowAction title="Naik" label="Pindah urutan ke atas" onClick={() => ctx.onReorder(t, -1)} className="hidden md:flex">↑</RowAction>
          )}
          {!last && (
            <RowAction title="Turun" label="Pindah urutan ke bawah" onClick={() => ctx.onReorder(t, 1)} className="hidden md:flex">↓</RowAction>
          )}
          <RowAction title="Edit" label="Edit topik" onClick={() => ctx.onEdit(t)}>✎</RowAction>
          <RowAction title="Hapus" label="Hapus topik" onClick={() => ctx.onDelete(t)}>🗑</RowAction>
        </div>
      </div>
      {hasKids && open && (
        <div className="ml-4 border-l border-linestrong/70 pl-1 sm:ml-5">
          {node.children.map((c, ci) => (
            <NodeRow key={c.topic.id} node={c} ctx={ctx} first={ci === 0} last={ci === node.children.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// Halaman Roadmap: pohon Subject → Topic → Subtopic dengan aksi kelola.
export default function RoadmapPage({ spaceId }) {
  const toast = useToast();
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
    const n = {}; const r = {};
    for (const x of notes) if (!x.deletedAt) n[x.topicId] = (n[x.topicId] || 0) + 1;
    for (const x of resources) r[x.topicId] = (r[x.topicId] || 0) + 1;
    return { notes: subtreeTotals(topics, n), resources: subtreeTotals(topics, r) };
  }, [topics, notes, resources]);

  const runAction = async (fn, okMsg) => {
    try { await fn(); toast.success(okMsg); }
    catch (e) { toast.error(toErrorMessage(e)); }
  };

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setExpanded((prev) => (prev.size >= parentIds.size ? new Set() : new Set(parentIds)));

  const openCreate = (parent) => setForm({ initial: null, parent });
  const openEdit = (topic) => setForm({ initial: topic, parent: null });

  const doMove = (target) => {
    const order = topics.filter((t) => (t.parentId || '') === (target.id || '')).length;
    runAction(() => setTopicOrders(spaceId, [{ id: move.id, parentId: target.id, level: move.level, order }]), 'Topik dipindahkan.');
    setMove(null);
  };

  const reorder = (topic, dir) => {
    const siblings = topics.filter((t) => (t.parentId || '') === (topic.parentId || '')).sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((t) => t.id === topic.id);
    const other = siblings[idx + dir];
    if (!other) return;
    runAction(() => setTopicOrders(spaceId, [
      { id: topic.id, parentId: topic.parentId, level: topic.level, order: other.order },
      { id: other.id, parentId: other.parentId, level: other.level, order: topic.order }
    ]), 'Urutan diperbarui.');
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
          <p>"{topic.title}"{nSub > 0 ? ` beserta ${nSub} subtopik di dalamnya` : ''} akan dihapus permanen.</p>
          <p className="text-dimmer">{nNotes} catatan & {nRes} resource milik topik ini tidak ikut terhapus — tersimpan sebagai tanpa-topik di menu Learn.</p>
        </div>
      ),
      confirmLabel: 'Hapus', danger: true,
      action: () => deleteTopics(spaceId, ids)
    });
  };

  const openImport = () => {
    if (topics.length) { toast.error('Roadmap sudah berisi topik. Template hanya untuk ruang kosong.'); return; }
    setConfirm({
      title: 'Impor template?',
      message: 'Template membuat: 📐 Mathematics → 📊 Probability → 🧠 Bayes (3 level sebagai contoh).',
      confirmLabel: 'Impor', danger: false,
      action: () => importTemplateRoadmap(spaceId)
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
    expanded, stats,
    onToggle: toggle, onAdd: openCreate, onEdit: openEdit,
    onMove: (t) => setMove(t), onDelete: openDelete, onReorder: reorder
  };

  return (
    <div className="space-y-5">
      <header className="card flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">learning berdua · perencanaan</div>
          <h1 className="font-head text-2xl text-ink">🗺️ Roadmap</h1>
          <p className="mt-1 text-[13.5px] leading-relaxed text-dim">Pohon belajar 3 level: Subject → Topic → Subtopic. Klik judul untuk halaman detail berisi Notes & Resources.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={openImport}>＋ Template</Button>
          <Button onClick={() => openCreate(null)}>＋ Subject</Button>
        </div>
      </header>

      {topics.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10.5px] uppercase tracking-[.06em] text-dimmer">
            {topics.length} topik · {roots.length} subject · {resources.length} resource · {notes.filter((x) => !x.deletedAt).length} catatan
          </p>
          {parentIds.size > 0 && (
            <button type="button" onClick={toggleAll} className="text-[12.5px] text-dim underline decoration-line underline-offset-4 transition hover:text-ink">
              {expanded.size >= parentIds.size ? 'Tutup semua' : 'Buka semua'}
            </button>
          )}
        </div>
      )}

      {loading && <div className="flex justify-center py-16"><Spinner size={28} /></div>}
      {error && <p className="text-[13.5px] text-accent">{error}</p>}

      {!loading && !error && roots.length === 0 && (
        <EmptyState icon="🗺️" title="Roadmap masih kosong"
          description="Buat subject pertama, lalu susun topic & subtopic di bawahnya. Klik ''＋ Template'' untuk memuat contoh 3 level."
          action={<div className="flex gap-2">
            <Button variant="ghost" onClick={openImport}>＋ Template</Button>
            <Button onClick={() => openCreate(null)}>＋ Subject</Button>
          </div>} />
      )}

      {!loading && !error && roots.length > 0 && (
        <div className="card overflow-hidden p-0">
          {roots.map((node, i) => (
            <NodeRow key={node.topic.id} node={node} ctx={ctx} first={i === 0} last={i === roots.length - 1} />
          ))}
        </div>
      )}

      <TopicFormModal open={Boolean(form)} onClose={() => setForm(null)} spaceId={spaceId}
        initial={form?.initial || null} parent={form?.parent || null} topics={topics} />
      <MoveTopicModal open={Boolean(move)} onClose={() => setMove(null)} topic={move} topics={topics} onMove={doMove} />
      <ConfirmModal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.title || ''}
        message={confirm?.message} confirmLabel={confirm?.confirmLabel || 'Hapus'} danger={confirm?.danger !== false}
        onConfirm={confirmAction} />
    </div>
  );
}
```

### `src/features/topics/components/TopicDetailPage.jsx`

```jsx
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
import { useResources } from '../../resources/hooks/useResources';
import { deleteTopics } from '../services/topicService';
import { descendantIds, topicPath } from '../utils/tree';
import { statusLabel, statusTone } from '../../../shared/utils/status';
import { LEVEL_LABEL, STATUS_LABEL } from '../../../lib/constants';
import { timeAgo } from '../../../shared/utils/time';
import TopicFormModal from './TopicFormModal';
import ConfirmModal from './ConfirmModal';

const TABS = [
  { key: 'notes', icon: '📝', label: 'Notes', placeholder: 'Modul editor catatan hadir pada checkpoint berikutnya.' },
  { key: 'resources', icon: '🔗', label: 'Resources', placeholder: 'Modul tambah resource hadir pada checkpoint berikutnya.' },
  { key: 'questions', icon: '❓', label: 'Questions', placeholder: 'Segera hadir.' },
  { key: 'quiz', icon: '🧩', label: 'Quiz', placeholder: 'Segera hadir.' }
];

function OwnerChip({ name, color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg2 py-0.5 pl-1 pr-2" title={label}>
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[11.5px] font-medium text-ink">{name}</span>
    </span>
  );
}

// Halaman detail topik: breadcrumb, batang progres, tab materi.
export default function TopicDetailPage({ spaceId }) {
  const { topicId } = useParams();
  const toast = useToast();
  const { user } = useAuthState();
  const { data: topics, loading: topicsLoading } = useTopics(spaceId);
  const { data: notes } = useNotes(spaceId);
  const { data: resources } = useResources(spaceId);
  const { data: space } = useSpace(spaceId);
  const roles = spaceRoles(space, user?.uid);
  const me = useUserProfile(user?.uid);
  const partner = useUserProfile(roles?.partner);

  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'notes';
  const setTab = (key) => setParams(key === 'notes' ? {} : { tab: key }, { replace: true });

  const topic = topics.find((t) => t.id === topicId);
  const crumb = useMemo(() => topicPath(topicId, topics), [topicId, topics]);
  const subtreeIds = useMemo(() => (topic ? [topic.id, ...descendantIds(topic.id, topics)] : []), [topic, topics]);
  const notesIn = useMemo(
    () => notes.filter((n) => !n.deletedAt && subtreeIds.includes(n.topicId))
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)),
    [notes, subtreeIds]
  );
  const resourcesIn = useMemo(
    () => resources.filter((r) => subtreeIds.includes(r.topicId))
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)),
    [resources, subtreeIds]
  );
  const children = useMemo(() => topics.filter((t) => t.parentId === topic?.id).sort((a, b) => a.order - b.order), [topics, topic]);
  const completed = children.filter((c) => c.status === 'completed').length;
  const pct = children.length ? Math.round((completed / children.length) * 100) : topic?.status === 'completed' ? 100 : 0;

  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const ownerName = (ownerId) => {
    if (!ownerId) return '—';
    if (ownerId === user?.uid) return me.data?.displayName || 'Kamu';
    if (ownerId === roles?.partner) return partner.data?.displayName || 'Partner';
    return '—';
  };

  const openDelete = () => {
    setConfirm({
      title: `Hapus ${(LEVEL_LABEL[topic.level] || 'topik').toLowerCase()} ini?`,
      message: `"${topic.title}"${children.length ? ` beserta ${children.length} subtopik di dalamnya` : ''} akan dihapus permanen. ${notesIn.length} catatan & ${resourcesIn.length} resource tidak ikut terhapus.`,
      confirmLabel: 'Hapus',
      action: () => deleteTopics(spaceId, [topic.id, ...descendantIds(topic.id, topics)]).then(() => toast.success('Topik dihapus.'))
    });
  };

  if (topicsLoading && !topics.length) {
    return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  }
  if (!topic) {
    return (
      <EmptyState icon="🤔" title="Topik tidak ditemukan"
        description="Topik ini mungkin sudah dihapus oleh salah satu anggota."
        action={<Link to="/roadmap"><Button variant="ghost">← Kembali ke Roadmap</Button></Link>} />
    );
  }

  const active = TABS.find((t) => t.key === tab);
  const levelLabel = LEVEL_LABEL[topic.level] || 'Topik';

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] uppercase tracking-[.05em] text-dimmer">
        <Link to="/roadmap" className="transition hover:text-ink">Roadmap</Link>
        {crumb.map((p, i) => {
          const last = i === crumb.length - 1;
          return (
            <span key={p.id} className="inline-flex max-w-full items-center gap-x-2">
              <span aria-hidden="true">/</span>
              {last ? <span className="truncate text-ink">{p.title}</span> : <Link to={`/roadmap/${p.id}`} className="truncate transition hover:text-ink">{p.title}</Link>}
            </span>
          );
        })}
      </nav>

      <section className="card space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 gap-4">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-smc border text-[24px]"
              style={{ backgroundColor: `${topic.color}22`, borderColor: topic.color }}>
              {topic.icon}
            </span>
            <div className="min-w-0">
              <div className="eyebrow">{levelLabel} · {STATUS_LABEL[topic.difficulty] || topic.difficulty}</div>
              <h1 className="mt-0.5 font-head text-2xl leading-tight text-ink">{topic.title}</h1>
              {topic.description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-dim">{topic.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(topic.status)}>{statusLabel(topic.status)}</Badge>
                <span className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">diperbarui {timeAgo(topic.updatedAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {topic.level < 2 && <Button onClick={() => setForm({ initial: null, parent: topic })}>＋ {LEVEL_LABEL[topic.level + 1]}</Button>}
            <Button variant="ghost" onClick={() => setForm({ initial: topic, parent: null })}>✎ Edit</Button>
            <Button variant="danger" onClick={openDelete}>🗑 Hapus</Button>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Kemajuan subtopik</div>
              <div className="mt-1 font-head text-[22px] leading-none text-ink">{completed}/{children.length} selesai</div>
            </div>
            <div className="font-mono text-[12px] tracking-[.05em] text-dimmer">{pct}%</div>
          </div>
          <div className="mt-3 h-[6px] w-full overflow-hidden rounded-full bg-panel2">
            <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, backgroundColor: 'var(--ok)' }} />
          </div>
          {children.length === 0 && (
            <p className="mt-3 text-[12.5px] text-dim">Belum ada {LEVEL_LABEL[topic.level + 1]?.toLowerCase() || 'subtopik'}. Tambahkan untuk melacak kemajuan.</p>
          )}
        </div>
      </section>

      <div role="tablist" aria-label="Jenis materi" className="flex border-b border-line">
        {TABS.map((t) => {
          const count = t.key === 'notes' ? notesIn.length : t.key === 'resources' ? resourcesIn.length : 0;
          return (
            <button key={t.key} role="tab" aria-selected={t.key === tab} onClick={() => setTab(t.key)}
              className={`-mb-px min-h-[44px] border-b-2 px-4 text-[13.5px] transition-colors ${t.key === tab ? 'border-b-accent font-semibold text-ink' : 'border-b-transparent text-dim hover:text-ink'}`}>
              {t.icon} {t.label}
              {count > 0 && <span className="ml-1 font-mono text-[11px] text-dimmer">{count}</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="space-y-3">
        {tab === 'notes' && (notesIn.length === 0
          ? <EmptyState icon="📝" title="Belum ada catatan" description={active.placeholder} />
          : notesIn.map((n) => (
              <article key={n.id} className="card space-y-2.5 !py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="min-w-0 truncate text-[14.5px] font-medium text-ink">{n.title}</h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <OwnerChip name={ownerName(n.ownerId)} color={n.ownerId === user?.uid ? (me.data?.color || '') : (partner.data?.color || '')} label={n.ownerId === user?.uid ? 'Kamu' : 'Partner'} />
                    <Badge tone={statusTone(n.status)}>{statusLabel(n.status)}</Badge>
                    <Badge tone={n.visibility === 'shared' ? 'accent' : 'dim'}>{STATUS_LABEL[n.visibility] || n.visibility}</Badge>
                  </div>
                </div>
                <p className="line-clamp-2 text-[13px] leading-relaxed text-dim">{String(n.content || '').replace(/[#*_`$\[\]!>~|]/g, '')}</p>
                <p className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">diperbarui {timeAgo(n.updatedAt)}</p>
              </article>
            )))}

        {tab === 'resources' && (resourcesIn.length === 0
          ? <EmptyState icon="🔗" title="Belum ada resource" description={active.placeholder} />
          : resourcesIn.map((r) => (
              <article key={r.id} className="card flex flex-wrap items-center gap-3 !py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-smc border border-line text-[15px]">{r.type === 'youtube' ? '▶️' : r.type === 'book' ? '📖' : '🔗'}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-medium text-ink">{r.title || r.url}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <Badge>{STATUS_LABEL[r.type] || r.type}</Badge>
                    <OwnerChip name={ownerName(r.authorId)} color={r.authorId === user?.uid ? (me.data?.color || '') : (partner.data?.color || '')} label={r.authorId === user?.uid ? 'Kamu' : 'Partner'} />
                    <span className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">{timeAgo(r.updatedAt)}</span>
                  </div>
                </div>
                {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-dim underline decoration-line underline-offset-4 hover:text-ink">buka ↗</a>}
              </article>
            )))}

        {(tab === 'questions' || tab === 'quiz') && <EmptyState icon={active.icon} title={active.label} description={active.placeholder} />}
      </div>

      <TopicFormModal open={Boolean(form)} onClose={() => setForm(null)} spaceId={spaceId}
        initial={form?.initial || null} parent={form?.parent || null} topics={topics} />
      <ConfirmModal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.title || ''}
        message={confirm?.message} confirmLabel="Hapus" danger onConfirm={() => confirm?.action?.()} />
    </div>
  );
}
```

### `src/app/layout/AppShell.jsx` (bagian yang diubah)

```jsx
import TopicDetailPage from '../../features/topics/components/TopicDetailPage';
// ...
<Route path="/roadmap" element={<RoadmapPage spaceId={spaceId} />} />
<Route path="/roadmap/:topicId" element={<TopicDetailPage spaceId={spaceId} />} />
```

---

## 3. Cara menjalankan

```bash
# Terminal 1 — emulator (data Roadmap lama boleh dibiarkan; untuk coba template HAPUS data dulu)
firebase emulators:start

# Terminal 2 — app
npm run dev            # http://localhost:5173 → Login → #/roadmap

# Cek produksi
npm run build          # ✓ hijau (103 modul)
```

Tidak menyentuh `firestore.rules`, jadi tidak perlu `npm run test:rules` pada CP3 ini.

---

## 4. Checklist uji manual

1. Buka **Roadmap** (`#/roadmap`) — ruang kosong → empty state + tombol "＋ Subject" & "＋ Template".
2. **Import template**: klik "＋ Template" → konfirmasi → 3 node muncul (Mathematics ▾ Probability ▸/▾ Bayes), status Mathematics "Sedang belajar", counts mono `📝0 · 🔗0` tiap node. Semua subject lain ter-expand default saat load.
3. **CRUD**:
   - "＋ Subject" (level 0) lalu "＋" di sebuah topik → buat Topic (level 1) → "＋" di topic → Subtopic (level 2). Tombol "＋" hilang di level 2.
   - Edit: ubah judul/ikon/emoji/warna/status/difficulty via ✎ → toast "…" tersimpan; daftar & detail ikut berubah.
   - Urutkan: tombol ↑/↓ saling menukar `order` (terlihat pada refresh saat data dimuat ulang) — tampil hanya antara ≥md dan bila ada sibling.
   - Pindah: tombol ⇄ (level 1 & 2) → pilih induk → node berpindah; level 2 hanya menerima calon level 1 (level 2 yang diinduk oleh level 1). Aturan: tidak bisa ke dirinya sendiri/keturunannya.
   - Hapus: 🗑 → konfirmasi menyebut jumlah subtopik + catatan/resource yang **tidak** ikut terhapus; hapus induk juga menghapus subtopiknya (cascade).
   - Validasi: simpan dengan judul kosong → "Judul wajib diisi."
4. **Halaman detail**: klik judul node → `#/roadmap/:id`; breadcrumb `Roadmap / Mathematics / Probability` (anak = tinta tebal, leluhur klikable); header (ikon, difficulty, badge status, "diperbarui …"); tombol ＋ Subtopic / ✎ Edit / 🗑 Hapus; batang "Kemajuan subtopik" berubah setelah status subtopik "Selesai".
5. **Tab**: Notes & Resources menampilkan daftar (kosong saat belum ada data → placeholder "hadir di checkpoint berikutnya"); Questions/Quiz → "Segera hadir". Deep-link `#/roadmap/:id?tab=resources` memilih tab.
6. **Expand/collapse**: caret ▸/▾ per node; "Buka semua"/"Tutup semua" di baris mono statistik; state bertahan per sesi.
7. **Refresh** di `#/roadmap/:id` → tidak 404; topik yang sudah dihapus → "Topik tidak ditemukan" + tombol kembali.
8. **Dark & light** keduanya terbaca (badge status, chip pemilik, garis pohon `border-l`).

## 5. Catatan

- Hook `useTopics/useNotes/useResources` adalah `onSnapshot` koleksi penuh (tanpa query filter) — visibility `private` pada notes tetap difilter **server-side oleh Firestore Rules**; tampilan ringkas di detail sengaja tidak membaca `noteStates/resourceStates` (dipakai penuh di CP4/CP5).
- Hapus topik bersifat **cascade** untuk topik, tetapi dokumen notes/resources yang menunjuk topik tidak diubah (field `topicId` divalidasi non-kosong oleh rules) → materi jadi "tanpa-topik" dan akan tampil di daftar Learn (CP4/5) sebagai orphan.
- Chunk JS ~787 kB (Firebase + KaTeX). Code-splitting tetap ditunda (CP7/deploy).
- `firestore.indexes.json` sudah menyiapkan indeks topics (level+order, parentId+order) & notes (deletedAt+updatedAt, dst.) untuk query produksi; aplikasi saat ini tidak wajib memakainya karena menyortir di client.