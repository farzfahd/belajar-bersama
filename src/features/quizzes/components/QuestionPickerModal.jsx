import { useEffect, useRef, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import { QUIZ_LIMITS } from '../../../lib/constants';
import QuestionPicker from './QuestionPicker';

// Modal "Tambah dari Question Bank": multi-select soal yang SUDAH ada.
// Tidak pernah membuat Question document baru — hanya mengembalikan daftar id
// untuk ditambahkan ke `quiz.questionIds` (Bagian H).
export default function QuestionPickerModal({
  open,
  onClose,
  onConfirm,
  questions = [],
  topics = [],
  loading = false,
  error = null,
  // id yang sudah dipakai kuis: tetap ditampilkan, tapi tidak bisa dipilih lagi.
  usedIds = []
}) {
  const [selected, setSelected] = useState([]);
  // Pilihan direset hanya saat modal dibuka, bukan tiap render.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      setSelected([]);
    } else if (!open) {
      wasOpen.current = false;
    }
  }, [open]);

  const usedSet = new Set(usedIds);
  const room = QUIZ_LIMITS.maxQuestions - usedIds.length;

  const toggle = (id) => {
    if (usedSet.has(id)) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirm = () => {
    onConfirm(selected);
    onClose();
  };

  const overQuota = selected.length > room;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Tambah dari Question Bank"
      subtitle="Soal yang sudah dipakai kuis ini tidak bisa dipilih lagi."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={confirm} disabled={selected.length === 0 || overQuota}>
            Tambah {selected.length > 0 ? `${selected.length} soal` : ''}
          </Button>
        </>
      }
    >
      <QuestionPicker
        questions={questions}
        topics={topics}
        loading={loading}
        error={error}
        selected={selected}
        onToggle={toggle}
      />
      <p className="mt-2 text-[12px] text-dimmer">
        Dipilih {selected.length} · sisa kuota {Math.max(0, room)} (maksimal {QUIZ_LIMITS.maxQuestions} soal)
      </p>
      {overQuota && (
        <p className="mt-1 text-[12.5px] text-accent">
          Terlalu banyak: kuis hanya bisa menambah {room} soal lagi.
        </p>
      )}
    </Modal>
  );
}

