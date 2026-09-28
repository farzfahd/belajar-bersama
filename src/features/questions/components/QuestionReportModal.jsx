import { useEffect, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import { IconFlag } from '../../../shared/icons';
import StatusNote from '../../../shared/ui/StatusNote';
import { useToast } from '../../../shared/components/ToastProvider';
import { toErrorMessage } from '../../../shared/utils/errors';
import {
  QUESTION_REPORT_LIMITS,
  QUESTION_REPORT_TYPE_LABELS,
  QUESTION_REPORT_TYPES
} from '../../../lib/constants';
import { reportQuestion } from '../services/questionService';

const TYPE_LIST = Object.entries(QUESTION_REPORT_TYPES);

export default function QuestionReportModal({ open, spaceId, question, onClose, onSent }) {
  const toast = useToast();
  const [type, setType] = useState(QUESTION_REPORT_TYPES.wrong_answer);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset form tiap kali dibuka supaya pesan lama tidak ikut terkirim ulang.
  useEffect(() => {
    if (open) {
      setType(QUESTION_REPORT_TYPES.wrong_answer);
      setMessage('');
      setBusy(false);
    }
  }, [open]);

  if (!open || !question) return null;

  const tooLong = message.length > QUESTION_REPORT_LIMITS.maxMessage;
  const messageMissing = !message.trim();
  const isOther = type === QUESTION_REPORT_TYPES.other;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await reportQuestion(spaceId, question.id, type, message);
      toast.success('Laporan terkirim ke pemilik soal.');
      onSent?.();
      onClose();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal mengirim laporan.'));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lapor Soal"
      subtitle="Kunci jawaban atau teks soal ini keliru? Beri tahu pemilik soalnya."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button
            type="submit"
            form="question-report-form"
            loading={busy}
            disabled={busy || !message.trim() || tooLong}
          >
            <IconFlag size={15} /> Kirim Laporan
          </Button>
        </>
      }
    >
      <form id="question-report-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-smc border border-line bg-bg2 px-3 py-2.5">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">Soal</div>
          <div className="line-clamp-3 text-[13.5px] leading-relaxed text-ink">{question.prompt}</div>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">
            Masalahnya apa?
          </legend>
          {TYPE_LIST.map(([value, label]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2.5 rounded-smc border px-3 py-2 text-[13.5px] transition ${
                type === value
                  ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-ink'
                  : 'border-line text-dim hover:border-linestrong'
              }`}
            >
              <input
                type="radio"
                name="question-report-type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="accent-accent"
              />
              <span>{QUESTION_REPORT_TYPE_LABELS[value] || label}</span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5">
          <label
            htmlFor="question-report-message"
            className="block font-mono text-[10.5px] uppercase tracking-wider text-dimmer"
          >
            Keterangan <span className="text-warn">wajib diisi</span>
          </label>
          <textarea
            id="question-report-message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Contoh: kunci jawaban seharusnya opsi B, bukan A."
            aria-invalid={tooLong || undefined}
            aria-describedby="question-report-hint"
            className={`w-full rounded-smc bg-bg2 p-3 text-[13.5px] leading-relaxed text-ink ${
              tooLong ? 'border border-danger' : 'border border-line'
            }`}
          />
          <div
            className={`text-right font-mono text-[10.5px] ${
              tooLong ? 'text-danger' : 'text-dimmer'
            }`}
          >
            {message.length} / {QUESTION_REPORT_LIMITS.maxMessage}
          </div>
          {/* Aturan mainan: keterangan selalu wajib, jadihint الجديد muncul
              sebelum pengguna menekan tombol yang tidak aktif. */}
          <div id="question-report-hint" className="space-y-1.5">
            {tooLong ? (
              <StatusNote tone="danger" title="Keterangan terlalu panjang">
                Ringkas sampai {QUESTION_REPORT_LIMITS.maxMessage} karakter supaya laporan enak dibaca.
              </StatusNote>
            ) : messageMissing ? (
              <StatusNote
                tone={isOther ? 'warn' : 'info'}
                title={isOther ? 'Sebutkan masalahnya' : 'Keterangan masih kosong'}
              >
                {isOther
                  ? 'Jenis "Lainnya" hanya berguna kalau kalimatnya jelas sejak awal. Contoh: "Opsi C dan D sama-sama benar, jadi petunjuk jawabannya tidak bisa dipakai."'
                  : 'Tulis satu kalimat yang menjelaskan masalahnya agar pemilik bisa langsung memperbaikinya.'}
              </StatusNote>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}
