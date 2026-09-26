import { useEffect, useRef, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import Select from '../../../shared/ui/Select';
import { toErrorMessage } from '../../../shared/utils/errors';
import { createQuiz } from '../services/quizService';
import { appendQuestionIds } from '../utils/quizQuestions';
import QuestionPicker from './QuestionPicker';

// Form buat kuis: judul + deskripsi + topik, lalu pilih minimal satu soal.
//
// CATATAN SCHEMA: `quiz.questionIds` wajib berisi 1..50 id (Firestore Rules
// `validQuiz`), jadi kuis TIDAK bisa dibuat tanpa soal. Karena itu panel
// QuestionPicker (yang sama dipakai di QuestionPickerModal) ditampilkan
// inline di step kedua form, bukan dibuatkan dokumen soal placeholder.
export default function QuizFormModal({ open, onClose, onCreated, spaceId, topics = [], questions, questionsLoading, questionsError }) {
  const [form, setForm] = useState({ title: '', description: '', topicId: '' });
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Reset hanya saat modal dibuka (pola sama seperti TopicFormModal).
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      setForm({ title: '', description: '', topicId: topics[0]?.id || '' });
      setPicked([]);
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
    if (picked.length === 0) {
      setError('Pilih minimal satu soal dari bank soal.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Validasi penuh (title, topicId, questionIds, settings) dijalankan di
      // service/quizSettings — form hanya memberi pesan yang lebih ramah.
      const id = await createQuiz(spaceId, {
        title: form.title,
        description: form.description,
        topicId: form.topicId,
        questionIds: appendQuestionIds([], picked)
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
      wide
      title="Buat Quiz"
      subtitle="Kuis menyimpan daftar soal sebagai snapshot; soal tetap hidup di bank soal."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Buat &amp; buka editor
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

        <div className="border-t border-line pt-4">
          <p className="section-title mb-2">Pilih soal (minimal 1)</p>
          <QuestionPicker
            questions={questions}
            topics={topics}
            loading={questionsLoading}
            error={questionsError}
            selected={picked}
            onToggle={(id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
          />
        </div>

        {error && <p className="text-[12.5px] text-accent">{error}</p>}
      </div>
    </Modal>
  );
}
