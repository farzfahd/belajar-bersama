import { useEffect, useRef, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import Select from '../../../shared/ui/Select';
import { createTopic, updateTopic } from '../services/topicService';
import { IDENTITY, LEVEL_LABEL, STATUS, STATUS_LABEL } from '../../../lib/constants';
import { toErrorMessage } from '../../../shared/utils/errors';

// Form buat/edit topik. initial null = mode buat (parent menentukan level/akar).
export default function TopicFormModal({
  open,
  onClose,
  spaceId,
  initial = null,
  parent = null,
  topics = [],
  onSaved = null
}) {
  const empty = {
    title: '',
    description: '',
    icon: '',
    color: parent?.color || IDENTITY.defaultColor,
    status: 'not_started',
    difficulty: 'beginner'
  };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Kunci sesi form: hanya reset saat target berubah (buka modal/create lain),
  // TIDAK saat objek initial ikut dibuat ulang oleh snapshot Firestore.
  const openedKey = useRef(null);

  useEffect(() => {
    if (!open) {
      openedKey.current = null;
      return;
    }
    const key = initial ? initial.id : parent ? parent.id : 'new';
    if (openedKey.current !== key) {
      openedKey.current = key;
      setForm(
        initial
          ? {
              title: initial.title || '',
              description: initial.description || '',
              icon: initial.icon || '',
              color: initial.color || IDENTITY.defaultColor,
              status: initial.status || 'not_started',
              difficulty: initial.difficulty || 'beginner'
            }
          : empty
      );
      setError(null);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const mode = initial
    ? `Edit ${(LEVEL_LABEL[initial.level] || 'Topik').toLowerCase()}`
    : `Buat ${(LEVEL_LABEL[parent ? parent.level + 1 : 0] || 'Topik').toLowerCase()}`;

  const save = async () => {
    const title = form.title.trim();
    if (!title) {
      setError('Judul wajib diisi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title,
        description: form.description.trim(),
        icon: form.icon.trim(),
        color: form.color,
        status: form.status,
        difficulty: form.difficulty
      };
      if (initial) {
        await updateTopic(spaceId, initial.id, payload);
        onSaved?.(initial.id);
      } else {
        const parentId = parent ? parent.id : null;
        const level = parent ? parent.level + 1 : 0;
        const order = topics.filter((t) => (t.parentId || '') === (parentId || '')).length;
        const id = await createTopic(spaceId, { parentId, level, order, ...payload });
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
      title={mode}
      subtitle={
        initial
          ? initial.title
          : parent
            ? `Di bawah ${LEVEL_LABEL[parent.level].toLowerCase()} "${parent.title}"`
            : `${LEVEL_LABEL[0]} tingkat atas (akar roadmap)`
      }
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
          error={error && !form.title ? 'Judul wajib diisi.' : undefined}
        />

        <div>
          <label className="eyebrow block" htmlFor="topic-desc">
            Deskripsi
          </label>
          <textarea
            id="topic-desc"
            rows={3}
            value={form.description}
            onChange={set('description')}
            maxLength={2000}
            className="mt-1.5 w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[14px] text-ink placeholder:text-dimmer transition focus:outline-2 focus:outline-offset-1 focus:outline-accent"
            placeholder="Bidang, tujuan, atau hal yang akan dipelajari…"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Ikon"
            value={form.icon}
            onChange={set('icon')}
            maxLength={8}
            placeholder="📄"
            hint="Emoji"
          />
          <Select label="Status" value={form.status} onChange={set('status')}>
            {STATUS.topic.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>

        <Select label="Tingkat kesulitan" value={form.difficulty} onChange={set('difficulty')}>
          {STATUS.difficulty.map((d) => (
            <option key={d} value={d}>
              {STATUS_LABEL[d]}
            </option>
          ))}
        </Select>

        <div className="space-y-1.5">
          <span className="eyebrow block">Warna</span>
          <div className="flex flex-wrap gap-2">
            {IDENTITY.colors.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Warna ${c}`}
                onClick={() => set('color')({ target: { value: c } })}
                 className={`h-11 w-11 rounded-full border-2 transition ${
                  form.color === c ? 'scale-110 border-ink' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {error && !(!form.title && error === 'Judul wajib diisi.') && (
          <p className="text-[12.5px] text-accent">{error}</p>
        )}
      </div>
    </Modal>
  );
}