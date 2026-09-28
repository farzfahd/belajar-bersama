// Dialog konfirmasi untuk aksi yang merusak (keluarkan soal, hapus kuis,
// hapus akun). Memakai `Modal` yang sudah ada, bukan window.confirm, supaya:
//   - tampilannya sama dengan design system aplikasi,
//   - bisa menjelaskan konsekuensi dalam bahasa yang jelas,
//   - fokus tetap di dalam dialog (sudah ditangani focus trap di Modal).
//
// Kegagalan TIDAK boleh jadi jalan buntu senyap: kalau `onConfirm` melempar,
// dialog tetap terbuka dengan pesan errornya. Menutupnya di situation itu sama
// dengan memberi tahu pengguna "beres" padahal belum ada yang berubah.
//
// `action` = { title, body, confirmLabel, danger, onConfirm } atau null.
import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import StatusNote from './StatusNote';
import { toErrorMessage } from '../utils/errors';

export default function ConfirmDialog({ action, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!action) return null;

  const { title, body, confirmLabel = 'Lanjutkan', danger = false, onConfirm } = action;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm?.();
      onClose?.();
    } catch (e) {
      // Dialog tetap terbuka: pengguna bisa membaca alasannya lalu mencoba lagi.
      setError(toErrorMessage(e, 'Aksi tidak bisa diselesaikan.'));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={title}
      subtitle={danger ? 'Tindakan ini tidak bisa dibatalkan.' : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button size="sm" variant={danger ? 'danger' : 'primary'} loading={busy} onClick={run}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[14px] leading-relaxed text-dim">{body}</p>
        {error && <StatusNote tone="danger">{error}</StatusNote>}
      </div>
    </Modal>
  );
}
