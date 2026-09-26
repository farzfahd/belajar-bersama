import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '../icons';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function getFocusable(container) {
  return Array.from(container?.querySelectorAll(FOCUSABLE) || []);
}

function trapFocus(e, container) {
  if (e.key !== 'Tab') return;
  const focusable = getFocusable(container);
  if (focusable.length === 0) {
    e.preventDefault();
    container?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!container.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export default function Modal({ open, onClose, title, subtitle, children, footer, wide = false }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    // Kunci scroll halaman selama modal terbuka supaya halaman di belakang
    // tidak ikut bergulir (satu scroll container saja yang aktif).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      (closeRef.current || getFocusable(dialogRef.current)[0] || dialogRef.current)?.focus();
    });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      trapFocus(e, dialogRef.current);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  // Portal ke body: `position: fixed` lalu selalu ter-resolve ke viewport,
  // STANDAR apa pun transform/filter/contain pada leluhur konten. Tanpa ini
  // overlay ikut ter-anchor ke wrapper halaman dan modal bisa keluar viewport
  // atau membuat scrollbar ganda.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-[rgba(26,23,20,.68)] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? 'Dialog' : undefined}
        tabIndex={-1}
        // my-2 + max-height berbasis 100dvh: panel tidak pernah keluar viewport;
        // hanya area konten yang bergulir, header & footer tetap terlihat.
        className={`my-2 flex max-h-[calc(100dvh-1rem)] w-full flex-col rounded-card border border-line bg-panel p-6 shadow-card ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <div>
             <h2 id={titleId} className="font-head text-lg text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-dim">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="icon-btn shrink-0"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain text-ink">{children}</div>
        {footer && (
          <div className="mt-5 flex shrink-0 justify-end gap-2 border-t border-line pt-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
