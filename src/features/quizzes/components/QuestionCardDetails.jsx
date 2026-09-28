import Input from '../../../shared/ui/Input';
import Select from '../../../shared/ui/Select';
import TagInput from '../../../shared/ui/TagInput';
import { STATUS } from '../../../lib/constants';

// "Detail lanjutan" kartu soal — collapsed by default supaya kartu utama tidak
// penuh sesak (meniru toggle "Deskripsi" Google Forms). Poin TIDAK ada di sini:
// poin sengaja tetap tampil ringkas di header kartu karena sering diubah.
//
// Isinya persis field metadata yang sudah ada di skema soal — tidak ada field
// baru, tidak ada perubahan skema.
//
// `idPrefix` WAJIB dioper pemanggil. `Input`/`Select` menurunkan id dari label
// saja ("field-topik"), sedangkan blok ini dirender di DALAM setiap kartu soal
// (sampai 50 kartu). Tanpa awalan per kartu, semua `<label for>` di daftar soal
// menunjuk field kartu pertama saja.
export default function QuestionCardDetails({
  value,
  onChange,
  topics = [],
  disabled = false,
  idPrefix = 'q'
}) {
  const draft = value || {};
  const set = (patch) => !disabled && onChange({ ...draft, ...patch });
  const fid = (name) => `${idPrefix}-${name}`;

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div>
        <label className="eyebrow block" htmlFor={fid('explanation')}>
          Penjelasan (muncul setelah dijawab)
        </label>
        <textarea
          id={fid('explanation')}
          rows={2}
          value={draft.explanation || ''}
          disabled={disabled}
          onChange={(e) => set({ explanation: e.target.value })}
          placeholder="Markdown + LaTeX. Tampil setelah peserta menjawab."
          className="mt-1.5 w-full rounded-smc border-b border-linestrong bg-transparent px-1 py-1.5 text-[14px] text-ink placeholder:text-dimmer focus:border-accent focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          id={fid('difficulty')}
          label="Kesulitan"
          value={draft.difficulty || 'beginner'}
          onChange={(e) => set({ difficulty: e.target.value })}
        >
          {STATUS.difficulty.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>

        <Select
          id={fid('visibility')}
          label="Visibilitas"
          value={draft.visibility || 'shared'}
          onChange={(e) => set({ visibility: e.target.value })}
        >
          {STATUS.visibility.map((v) => (
            <option key={v} value={v}>
              {v === 'shared' ? 'Shared (terlihat partner)' : 'Private (hanya saya)'}
            </option>
          ))}
        </Select>

        <Select
          id={fid('topic')}
          label="Topik"
          value={draft.topicId || ''}
          disabled={disabled}
          onChange={(e) => set({ topicId: e.target.value })}
        >
          <option value="">Pilih topik…</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>

        <Input
          id={fid('time-limit')}
          label="Batas waktu per soal (detik)"
          type="number"
          min="0"
          value={draft.timeLimitSeconds ?? 0}
          disabled={disabled}
          onChange={(e) => set({ timeLimitSeconds: e.target.value })}
          hint="0 = mengikuti batas waktu kuis"
        />
      </div>

      <TagInput
        label="Tag"
        value={Array.isArray(draft.tags) ? draft.tags : []}
        onChange={(tags) => set({ tags })}
      />

      <Input
        id={fid('attachment')}
        label="Lampiran URL (opsional)"
        value={draft.attachmentUrl || ''}
        disabled={disabled}
        onChange={(e) => set({ attachmentUrl: e.target.value })}
        placeholder="https://…"
      />
    </div>
  );
}
