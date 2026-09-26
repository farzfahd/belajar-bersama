import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import Select from '../../../shared/ui/Select';
import Spinner from '../../../shared/components/Spinner';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useProfile } from '../../auth/hooks/useProfile';
import { useSpaceId } from '../../space/SpaceContext';
import { useSpace } from '../../space/hooks/useSpace';
import { useUserProfile } from '../../space/hooks/useUserProfile';
import { spaceRoles } from '../../space/services/spaceService';
import { useTopics } from '../../topics/hooks/useTopics';
import { useNotes } from '../hooks/useNotes';
import { useNoteStates } from '../hooks/useNoteStates';
import { visibleActiveNotes } from '../utils/visibility';
import {
  isTrashExpired,
  purgeExpiredNotes,
  purgeNote,
  restoreNote,
  softDeleteNote
} from '../services/noteService';
import { STATUS, STATUS_LABEL } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';
import NoteCard from './NoteCard';
import ConfirmModal from '../../topics/components/ConfirmModal';

// Panel "Notes" di halaman Learn: daftar aktif + sampah (soft-delete owner-only).
export default function NotesPanel() {
  const spaceId = useSpaceId();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuthState();
  const { data: notes, loading, error } = useNotes(spaceId);
  const { data: states } = useNoteStates(spaceId);
  const { data: topics } = useTopics(spaceId);
  const { data: space } = useSpace(spaceId);
  const roles = spaceRoles(space, user?.uid);
  const me = useProfile(user?.uid);
  const partner = useUserProfile(roles?.partner);

  const [filterTopic, setFilterTopic] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterVisibility, setFilterVisibility] = useState('all');
  const [sortBy, setSortBy] = useState('updated');
  const [view, setView] = useState('active'); // 'active' | 'trash'
  const [confirm, setConfirm] = useState(null);
  const purgedRef = useRef(false);

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

  const orderedTopics = [...topics].sort(
    (a, b) => a.level - b.level || a.order - b.order || a.title.localeCompare(b.title)
  );

  const myTrash = useMemo(
    () => notes.filter((n) => n.deletedAt && n.ownerId === user?.uid),
    [notes, user?.uid]
  );

  // Sampah >30 hari dibersihkan saat panel ini dibuka (sekali per mount).
  useEffect(() => {
    if (purgedRef.current || loading || myTrash.length === 0) return;
    if (!myTrash.some((note) => isTrashExpired(note))) return;
    purgedRef.current = true;
    purgeExpiredNotes(spaceId, myTrash).then(({ purged, failed }) => {
      if (purged > 0) toast.success(`${purged} catatan kedaluwarsa dihapus dari Sampah.`);
      if (failed > 0) toast.error(`${failed} catatan gagal dihapus otomatis.`);
    });
  }, [myTrash, loading, spaceId, toast]);

  // Tag yang muncul pada catatan yang terlihat → opsi filter.
  const availableTags = useMemo(() => {
    const set = new Set();
    for (const note of visibleActiveNotes(notes, user?.uid)) {
      for (const tag of note.tags || []) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [notes, user?.uid]);

  const matchesFilters = (n) => {
    if (filterTopic !== 'all' && n.topicId !== filterTopic) return false;
    if (filterStatus !== 'all' && n.status !== filterStatus) return false;
    if (filterTag !== 'all' && !(n.tags || []).includes(filterTag)) return false;
    if (filterOwner === 'mine' && n.ownerId !== user?.uid) return false;
    if (filterOwner === 'partner' && n.ownerId === user?.uid) return false;
    if (filterVisibility !== 'all' && n.visibility !== filterVisibility) return false;
    return true;
  };

  const bySort = (a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title, 'id');
    return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
  };

  const active = useMemo(
    () => visibleActiveNotes(notes, user?.uid).filter(matchesFilters).sort(bySort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, user?.uid, filterTopic, filterStatus, filterTag, filterOwner, filterVisibility, sortBy]
  );
  const trash = useMemo(
    () => myTrash.filter(matchesFilters).sort(bySort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myTrash, user?.uid, filterTopic, filterStatus, filterTag, filterOwner, filterVisibility, sortBy]
  );

  const runConfirm = async (action, okMsg) => {
    try {
      await action();
      toast.success(okMsg);
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  const openDelete = (note) =>
    setConfirm({
      title: `Hapus "${note.title}"?`,
      message:
        'Catatan dipindah ke Sampah. Partner tidak akan bisa melihatnya; kamu bisa memulihkannya dalam 30 hari.',
      confirmLabel: 'Hapus',
      danger: true,
      action: () => softDeleteNote(spaceId, note.id)
    });

  const openPurge = (note) =>
    setConfirm({
      title: `Hapus permanen "${note.title}"?`,
      message: 'Catatan ini akan hilang selamanya dan tidak bisa dipulihkan.',
      confirmLabel: 'Permanen',
      danger: true,
      action: () => purgeNote(spaceId, note.id)
    });

  const confirmAction = async () => {
    await runConfirm(confirm.action, confirm.danger ? 'Catatan dihapus.' : 'Catatan dipulihkan.');
  };

  const list = view === 'trash' ? trash : active;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            aria-label="Filter topik"
            className="w-[9.5rem]"
          >
            <option value="all">Semua topik</option>
            {orderedTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {'·  '.repeat(t.level)}
                {t.title}
              </option>
            ))}
          </Select>
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filter status"
            className="w-[8.5rem]"
          >
            <option value="all">Semua status</option>
            {STATUS.note.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            aria-label="Filter tag"
            className="w-[8.5rem]"
          >
            <option value="all">Semua tag</option>
            {availableTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </Select>
          <Select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            aria-label="Filter pemilik"
            className="w-[8rem]"
          >
            <option value="all">Semua pemilik</option>
            <option value="mine">Milik saya</option>
            <option value="partner">Milik partner</option>
          </Select>
          <Select
            value={filterVisibility}
            onChange={(e) => setFilterVisibility(e.target.value)}
            aria-label="Filter visibilitas"
            className="w-[8.5rem]"
          >
            <option value="all">Semua visibilitas</option>
            <option value="shared">Shared</option>
            <option value="private">Private</option>
          </Select>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Urutkan"
            className="w-[8rem]"
          >
            <option value="updated">Terbaru</option>
            <option value="title">Judul A-Z</option>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setView(view === 'trash' ? 'active' : 'trash')}
          >
            🗑 Sampah ({trash.length})
          </Button>
          <Button onClick={() => navigate('/notes/new')}>＋ Catatan</Button>
        </div>
      </div>

      {view === 'trash' && (
        <p className="font-mono text-[10.5px] uppercase tracking-[.06em] text-dimmer">
          Sampah hanya menampilkan catatan milikmu (privasi partner dijaga).
        </p>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <Spinner size={28} />
        </div>
      )}
      {error && <p className="text-[13.5px] text-accent">{error}</p>}

      {!loading && !error && list.length === 0 && (
        <EmptyState
          icon={view === 'trash' ? '🗑' : '📝'}
          title={view === 'trash' ? 'Sampah kosong' : 'Belum ada catatan'}
          description={
            view === 'trash'
              ? 'Catatan yang kamu hapus akan muncul di sini.'
              : 'Catatan menempel pada sebuah topik di Roadmap. Klik "＋ Catatan" untuk mulai menulis.'
          }
          action={
            view === 'trash' ? (
              <Button variant="ghost" onClick={() => setView('active')}>
                ← Kembali ke catatan
              </Button>
            ) : (
              <Button onClick={() => navigate('/notes/new')}>＋ Catatan baru</Button>
            )
          }
        />
      )}

      {!loading && !error && list.length > 0 && (
        <div className="space-y-1">
          {list.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              spaceId={spaceId}
              topics={topics}
              me={user?.uid}
              states={states}
              ownerName={ownerName}
              ownerColor={ownerColor}
              trashed={view === 'trash'}
              onEdit={(x) => navigate(`/notes/${x.id}?edit=1&from=${encodeURIComponent('/learn?tab=notes')}`)}
              onReport={(x) => navigate(`/notes/${x.id}?from=${encodeURIComponent('/learn?tab=notes')}`)}
              onDelete={openDelete}
              onRestore={(x) => runConfirm(() => restoreNote(spaceId, x.id), 'Catatan dipulihkan.')}
              onPurge={openPurge}
            />
          ))}
        </div>
      )}

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
