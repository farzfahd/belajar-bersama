import { useEffect, useRef, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import Select from '../../../shared/ui/Select';
import TagInput from '../../../shared/ui/TagInput';
import { useTagSuggestions } from '../../search/hooks/useTagSuggestions';
import { createResource, updateResource } from '../services/resourceService';
import { STATUS, STATUS_LABEL } from '../../../lib/constants';
import { detectResourceType, resourceTypeIcon } from '../utils/icons';
import { toErrorMessage } from '../../../shared/utils/errors';
import { normalizeTags } from '../../../shared/utils/validate';

const VISIBILITY_OPTIONS = [
  { value: 'shared', label: 'Shared · terlihat dua-duanya' },
  { value: 'private', label: 'Private · hanya kamu' }
];

// Form buat/edit resource (tautan sumber belajar). initial null = mode buat;
// presetTopicId menjadi topik bawaan saat tidak ada initial.
export default function ResourceFormModal({
  open,
  onClose,
  spaceId,
  topics = [],
  initial = null,
  presetTopicId = null,
  onSaved = null
}) {
  const empty = {
    title: '',
    type: 'website',
    url: '',
    topicId: presetTopicId || '',
    difficulty: 'beginner',
    visibility: 'shared',
    author: '',
    estimatedMinutes: '',
    description: '',
    tags: []
  };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const tagSuggestions = useTagSuggestions(spaceId);
  // Kunci sesi form: hanya reset saat target berubah (buka modal/create lain),
  // TIDAK saat objek initial ikut dibuat ulang oleh snapshot Firestore.
  const openedKey = useRef(null);

  useEffect(() => {
    if (!open) {
      openedKey.current = null;
      return;
    }
    const key = initial ? initial.id : presetTopicId ? `new-${presetTopicId}` : 'new';
    if (openedKey.current !== key) {
      openedKey.current = key;
      setForm(
        initial
          ? {
              title: initial.title || '',
              type: initial.type || 'website',
              url: initial.url || '',
              topicId: initial.topicId || '',
              difficulty: initial.difficulty || 'beginner',
              visibility: initial.visibility || 'shared',
              author: initial.author || '',
              estimatedMinutes: initial.estimatedMinutes || '',
              description: initial.description || '',
              tags: normalizeTags(Array.isArray(initial.tags) ? initial.tags : [])
            }
          : empty
      );
      setError(null);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const orderedTopics = [...topics].sort(
    (a, b) => a.level - b.level || a.order - b.order || a.title.localeCompare(b.title)
  );

  const save = async () => {
    if (!form.title.trim()) {
      setError('Judul wajib diisi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        type: form.type,
        url: form.url,
        topicId: form.topicId,
        difficulty: form.difficulty,
        visibility: form.visibility,
        author: form.author,
        estimatedMinutes: Number(form.estimatedMinutes),
        description: form.description,
        tags: normalizeTags(form.tags)
      };
      if (initial) {
        await updateResource(spaceId, initial.id, payload);
        onSaved?.(initial.id);
      } else {
        const id = await createResource(spaceId, payload);
        onSaved?.(id);
      }
      onClose();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit resource' : '＋ Resource'}
      subtitle={
        initial
          ? initial.title
          : 'Simpan tautan sumber belajar untuk belajar bersama (website, buku, video, paper, dsb.).'
      }
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Judul"
          value={form.title}
          onChange={set('title')}
          maxLength={200}
          autoFocus
          error={error === 'Judul wajib diisi.' ? 'Judul wajib diisi.' : undefined}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="URL"
            value={form.url}
            onChange={(e) => {
              const url = e.target.value;
              // Deteksi otomatis: URL YouTube langsung menjadi jenis youtube,
              // tapi pilihan manual user tidak ditimpa.
              const detected = detectResourceType(url, form.type);
              setForm((f) => ({ ...f, url, type: detected }));
            }}
            maxLength={2048}
            placeholder="https://…"
            hint="Harus diawali http:// atau https://. URL YouTube terdeteksi otomatis."
            error={error === 'URL harus diawali http:// atau https://.' ? error : undefined}
          />
          <Select label="Topik" value={form.topicId} onChange={set('topicId')}>
            <option value="">Pilih topik…</option>
            {orderedTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {'·  '.repeat(t.level)}
                {t.title}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Jenis" value={form.type} onChange={set('type')}>
            {STATUS.resource.map((t) => (
              <option key={t} value={t}>
                {resourceTypeIcon(t)} {STATUS_LABEL[t]}
              </option>
            ))}
          </Select>
          <Select label="Tingkat kesulitan" value={form.difficulty} onChange={set('difficulty')}>
            {STATUS.difficulty.map((d) => (
              <option key={d} value={d}>
                {STATUS_LABEL[d]}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Penulis / sumber"
            value={form.author}
            onChange={set('author')}
            maxLength={100}
            placeholder="Opsional"
          />
          <Input
            label="Estimasi (menit)"
            type="number"
            min={0}
            step={1}
            value={form.estimatedMinutes}
            onChange={set('estimatedMinutes')}
            placeholder="Opsional"
          />
        </div>

        <Select label="Visibilitas" value={form.visibility} onChange={set('visibility')}>
          {VISIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <TagInput
          value={form.tags}
          onChange={(tags) => setForm((f) => ({ ...f, tags }))}
          suggestions={tagSuggestions}
        />

        <div>
          <label className="eyebrow block" htmlFor="resource-desc">
            Deskripsi
          </label>
          <textarea
            id="resource-desc"
            rows={3}
            value={form.description}
            onChange={set('description')}
            maxLength={2000}
            className="mt-1.5 w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[14px] text-ink placeholder:text-dimmer transition focus:outline-2 focus:outline-offset-1 focus:outline-accent"
            placeholder="Catatan singkat…"
          />
        </div>

        {error && !['Judul wajib diisi.', 'URL harus diawali http:// atau https://.'].includes(error) && (
          <p className="text-[12.5px] text-accent">{error}</p>
        )}
      </div>
    </Modal>
  );
}