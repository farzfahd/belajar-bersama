import { IconExternalLink } from '../../../shared/icons';
import { useMemo, useState } from 'react';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import FilterPanel from '../../../shared/ui/FilterPanel';
import Select from '../../../shared/ui/Select';
import PageLoading from '../../../shared/components/PageLoading';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useProfile } from '../../auth/hooks/useProfile';
import { useSpaceId } from '../../space/SpaceContext';
import { useSpace } from '../../space/hooks/useSpace';
import { useUserProfile } from '../../space/hooks/useUserProfile';
import { spaceRoles } from '../../space/services/spaceService';
import { useTopics } from '../../topics/hooks/useTopics';
import { useResources } from '../hooks/useResources';
import { useResourceStates } from '../hooks/useResourceStates';
import { visibleActiveResources } from '../utils/visibility';
import { deleteResource } from '../services/resourceService';
import { STATUS, STATUS_LABEL } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';
import ResourceCard from './ResourceCard';
import ResourceFormModal from './ResourceFormModal';
import ConfirmModal from '../../topics/components/ConfirmModal';

// Panel "Resources": daftar aktif + status baca per anggota.
// scopeIds (opsional): batasi ke topik-topik tertentu (dipakai halaman detail);
// presetTopicId (opsional): topik bawaan saat membuat resource baru.
export default function ResourcesPanel({ scopeIds = null, presetTopicId = null }) {
  const spaceId = useSpaceId();
  const toast = useToast();
  const { user } = useAuthState();
  const { data: resources, loading, error } = useResources(spaceId);
  const { data: states, loading: statesLoading, error: statesError } = useResourceStates(spaceId);
  const { data: topics, loading: topicsLoading, error: topicsError } = useTopics(spaceId);
  const { data: space } = useSpace(spaceId);
  const roles = spaceRoles(space, user?.uid);
  const me = useProfile(user?.uid);
  const partner = useUserProfile(roles?.partner);
  const contentLoading = loading || statesLoading || topicsLoading;
  const contentError = error || statesError || topicsError;

  const [filterTopic, setFilterTopic] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState(null); // null | { initial } | { preset: topicId }
  const [confirm, setConfirm] = useState(null);

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

  const scoped = useMemo(() => {
    let out = visibleActiveResources(resources, user?.uid);
    if (scopeIds) out = out.filter((r) => scopeIds.includes(r.topicId));
    return out;
  }, [resources, scopeIds, user?.uid]);

  // Tag yang tersedia untuk filter, dihitung dari resource yang terlihat.
  const availableTags = useMemo(() => {
    const set = new Set();
    for (const resource of scoped) {
      for (const tag of resource.tags || []) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [scoped]);

  const myStateOf = (resource) =>
    (states || []).find((s) => s.uid === user?.uid && s.resourceId === resource.id);

  const list = useMemo(() => {
    let out = scoped;
    if (!scopeIds && filterTopic !== 'all') out = out.filter((r) => r.topicId === filterTopic);
    if (filterType !== 'all') out = out.filter((r) => r.type === filterType);
    if (filterTag !== 'all') out = out.filter((r) => (r.tags || []).includes(filterTag));
    if (filterStatus !== 'all') {
      out = out.filter((r) => {
        const status = myStateOf(r)?.status || 'not_started';
        return status === filterStatus;
      });
    }
    return out.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, states, filterTopic, filterType, filterTag, filterStatus, user?.uid]);

  // Jumlah filter aktif untuk badge di tombol filter.
  const activeFilterCount = [filterTopic, filterType, filterTag, filterStatus].filter(
    (v) => v !== 'all'
  ).length;
  const resetFilters = () => {
    setFilterTopic('all');
    setFilterType('all');
    setFilterTag('all');
    setFilterStatus('all');
  };

  const openDelete = (resource) =>
    setConfirm({
      title: `Hapus "${resource.title || resource.url}"?`,
      message: 'Resource akan dihapus permanen dan tidak bisa dipulihkan.',
      confirmLabel: 'Hapus',
      danger: true,
      action: () => deleteResource(spaceId, resource.id)
    });

  const confirmAction = async () => {
    try {
      await confirm.action();
      toast.success('Resource dihapus.');
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!scopeIds ? (
          <FilterPanel
            activeCount={activeFilterCount}
            onReset={resetFilters}
            filters={[
              {
                key: 'topic',
                label: 'Topik',
                node: (
                  <Select
                    value={filterTopic}
                    onChange={(e) => setFilterTopic(e.target.value)}
                    aria-label="Filter topik"
                  >
                    <option value="all">Semua topik</option>
                    {orderedTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {'·  '.repeat(t.level)}
                        {t.title}
                      </option>
                    ))}
                  </Select>
                )
              },
              {
                key: 'type',
                label: 'Jenis',
                node: (
                  <Select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    aria-label="Filter jenis"
                  >
                    <option value="all">Semua jenis</option>
                    {STATUS.resource.map((t) => (
                      <option key={t} value={t}>
                        {STATUS_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                )
              },
              {
                key: 'tag',
                label: 'Tag',
                node: (
                  <Select
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                    aria-label="Filter tag"
                  >
                    <option value="all">Semua tag</option>
                    {availableTags.map((t) => (
                      <option key={t} value={t}>
                        #{t}
                      </option>
                    ))}
                  </Select>
                )
              },
              {
                key: 'status',
                label: 'Status baca',
                node: (
                  <Select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    aria-label="Filter status baca"
                  >
                    <option value="all">Semua status</option>
                    <option value="not_started">Belum dibaca</option>
                    <option value="reading">Sedang dibaca</option>
                    <option value="completed">Sudah selesai</option>
                  </Select>
                )
              }
            ]}
          />
        ) : (
          <span className="font-mono text-[10.5px] uppercase tracking-[.06em] text-dimmer">
            {list.length} resource · klik judul untuk membuka
          </span>
        )}
        <Button
          disabled={topicsLoading || topics.length === 0}
          onClick={() =>
            setForm({ initial: null, preset: presetTopicId || (filterTopic !== 'all' ? filterTopic : null) })
          }
        >
          ＋ Resource
        </Button>
      </div>

      {contentLoading && (
        <PageLoading label="Memuat resource…" />
      )}
      {contentError && <p className="text-[13.5px] text-accent">{contentError}</p>}

      {!contentLoading && !contentError && topics.length === 0 && (
        <p className="text-[13px] text-dim">
          Buat atau impor Roadmap terlebih dahulu. Setiap resource harus menempel pada sebuah topik.
        </p>
      )}

      {!contentLoading && !contentError && topics.length > 0 && list.length === 0 && (
        <EmptyState
          icon={<IconExternalLink size={26} />}
          title="Belum ada resource"
          description="Simpan tautan sumber belajar (website, YouTube, buku, paper, repo, dsb.) pada sebuah topik Roadmap, lalu tandai status bacanya."
          action={scopeIds ? null : <Button onClick={() => setForm({ initial: null, preset: filterTopic !== 'all' ? filterTopic : null })}>＋ Resource baru</Button>}
        />
      )}

      {!contentLoading && !contentError && list.length > 0 && (
        <div className="space-y-1">
          {list.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              spaceId={spaceId}
              topics={topics}
              me={user?.uid}
              states={states}
              partner={roles?.partner}
              ownerName={ownerName}
              ownerColor={ownerColor}
              onEdit={(x) => setForm({ initial: x, preset: null })}
              onDelete={openDelete}
            />
          ))}
        </div>
      )}

      <ResourceFormModal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        spaceId={spaceId}
        topics={topics}
        initial={form?.initial || null}
        presetTopicId={form?.preset || null}
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