import { useEffect, useRef, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import Select from '../../../shared/ui/Select';
import { toErrorMessage } from '../../../shared/utils/errors';
import { createQuiz } from '../services/quizService';

// Form buat kuis: HANYA judul + deskripsi + topik.
//
// Kuis sengaja boleh dibuat dengan `questionIds: []` (draft): setelah create
// berhasil, user langsung masuk ke `/quiz/:quizId` (QuizEditorPage) untuk
// menambah soal dari editor. Ini selaras dengan `validQuiz` di firestore.rules
// yang kini menerima list kosong. Soal yang sudah tersimpan tetap bisa
// ditambahkan nanti lewat tombol "Tambah Soal" → "Pilih Soal Tersimpan".
export default function QuizFormModal({ open, onClose, onCreated, spaceId, topics = [] }) {
  const [form, setForm] = useState({ title: '', description: '', topicId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Reset hanya saat modal dibuka (pola sama seperti TopicFormModal).
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      setForm({ title: '', description: '', topicId: topics[0]?.id || '' });
      setError(null);
      setBusy(false);
    } else if (!open) {
      wasOpen.current = false;
    }
  }, [open, topics]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) {
      setError('Judul kuis wajib diisi.');
      return;
    }
    if (!form.topicId) {
      setError('Topik kuis wajib dipilih.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // `questionIds: []` — draft. Validasi penuh (title, topicId, settings)
      // dijalankan di service/quizSettings; form hanya pesan lebih ramah.
      const id = await createQuiz(spaceId, {
        title: form.title,
        description: form.description,
        topicId: form.topicId,
        questionIds: []
      });
      onClose();
      onCreated?.(id);
      return id;
    } catch (e) {
      setError(toErrorMessage(e, 'Gagal membuat kuis.'));
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Buat Quiz"
      subtitle="Setelah dibuat, kamu langsung masuk ke editor untuk menambah soal."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Buat Quiz
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Judul kuis"
          value={form.title}
          onChange={set('title')}
          maxLength={200}
          autoFocus
          placeholder="Contoh: Bab 1 — Persamaan Kuadrat"
        />

        <div>
          <label className="eyebrow block" htmlFor="quiz-desc">
            Deskripsi
          </label>
          <textarea
            id="quiz-desc"
            rows={2}
            value={form.description}
            onChange={set('description')}
            maxLength={2000}
            className="mt-1.5 w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[14px] text-ink placeholder:text-dimmer transition focus:outline-2 focus:outline-offset-1 focus:outline-accent"
            placeholder="Cakupan materi, catatan singkat…"
          />
        </div>

        <Select label="Topik" value={form.topicId} onChange={set('topicId')}>
          <option value="">Pilih topik…</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>

        {error && <p className="text-[12.5px] text-accent">{error}</p>}
      </div>
    </Modal>
  );
}
