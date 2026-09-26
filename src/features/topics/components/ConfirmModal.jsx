import { useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';

// Konfirmasi destruktif (hapus/pindah). message boleh string atau node JSX.
export default function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Hapus',
  danger = true,
  onConfirm
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm?.();
      onClose();
    } catch (e) {
      setError(e?.message || 'Gagal menjalankan aksi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={run} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {typeof message === 'string' ? (
          <p className="text-[13.5px] leading-relaxed text-dim">{message}</p>
        ) : (
          message
        )}
        {error && <p className="text-[12.5px] text-accent">{error}</p>}
      </div>
    </Modal>
  );
}