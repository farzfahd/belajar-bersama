import { IconPlus, IconEmptyResource } from '../../../shared/icons';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';

// Chooser "Tambah Soal": satu pintu masuk untuk menambah soal ke kuis.
// Dua pilihan saja, keduanya memakai komponen existing:
//  - "Buat Soal Baru"  -> QuestionFormModal yang sudah ada
//  - "Pilih Soal Tersimpan" -> QuestionPickerModal yang sudah ada
// Tidak ada halaman baru; user tidak pernah meninggalkan Quiz Editor.
export default function AddQuestionModal({ open, onClose, onCreateNew, onPickSaved }) {
  const Option = ({ onClick, icon, title, description, disabled, disabledHint }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className="flex w-full items-start gap-3 rounded-smc border border-line bg-bg2 p-3 text-left transition hover:border-linestrong hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-ink">{title}</span>
        <span className="block text-[12.5px] leading-relaxed text-dim">
          {disabled ? disabledHint : description}
        </span>
      </span>
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tambah Soal"
      subtitle="Soal yang ditambahkan otomatis tersimpan dan bisa dipakai lagi di kuis lain."
      footer={<Button variant="ghost" onClick={onClose}>Batal</Button>}
    >
      <div className="space-y-2.5">
        <Option
          onClick={onCreateNew}
          icon={<IconPlus size={26} />}
          title="Buat Soal Baru"
          description="Tulis soal dari nol. Tersimpan sebagai soal lalu langsung masuk ke kuis ini."
        />
        <Option
          onClick={onPickSaved}
          icon={<IconEmptyResource size={26} />}
          title="Pilih Soal Tersimpan"
          description="Cari dan pilih soal yang sudah pernah dibuat, milikmu atau milik partner."
        />
      </div>
    </Modal>
  );
}
