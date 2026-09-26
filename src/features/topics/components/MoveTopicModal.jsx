import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import { descendantIds } from '../utils/tree';
import { LEVEL_LABEL } from '../../../lib/constants';

// Pindahkan topik ke subject/induk lain (level dipertahankan).
export default function MoveTopicModal({ open, onClose, onMove, topic, topics }) {
  const [selected, setSelected] = useState(null);

  // Reset pilihan tiap kali modal dibuka (hindari sisa pilihan sesi sebelumnya).
  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  const candidates = useMemo(() => {
    if (!topic) return [];
    const excluded = new Set([topic.id, topic.parentId, ...descendantIds(topic.id, topics)]);
    return topics
      .filter((t) => t.level === topic.level - 1 && !excluded.has(t.id))
      .sort((a, b) => a.order - b.order);
  }, [topic, topics]);

  if (!topic) return null;
  const levelLabel = LEVEL_LABEL[topic.level + 1] || 'Topik';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Pindahkan ${levelLabel.toLowerCase()}`}
      subtitle={topic.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={() => selected && onMove(selected)}
            disabled={!selected}
          >
            Pindah
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-[13.5px] leading-relaxed text-dim">
          Tidak ada induk valid sebagai tujuan pindah.
          {topic.level === 1 && ' Subject hanya bisa ditaruh sebagai akar (tidak dipindah).'}
        </p>
      ) : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          <p className="text-[12.5px] text-dimmer">
            Pilih {LEVEL_LABEL[topic.level - 1].toLowerCase()} baru & topik akan ditaruh paling bawah.
          </p>
          {candidates.map((c) => {
            const checked = selected?.id === c.id;
            return (
              <label
                key={c.id}
                 className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-smc border px-3 py-2.5 transition ${
                  checked ? 'border-ink bg-bg2' : 'border-line hover:border-linestrong'
                }`}
              >
                <input
                  type="radio"
                  name="move-parent"
                  checked={checked}
                  onChange={() => setSelected(c)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    <span className="mr-1.5" style={{ color: c.color }}>{c.icon}</span>
                    {c.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">
                    {LEVEL_LABEL[c.level]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}