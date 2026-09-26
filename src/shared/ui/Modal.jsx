import { useEffect, useId, useRef } from 'react';

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
      document.removeEventListener('keydown', onKey);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-[rgba(26,23,20,.68)] p-4"
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
         className={`my-4 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-card border border-line bg-panel p-6 shadow-card`}
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
            ✕
          </button>
        </div>
        <div className="text-ink">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">{footer}</div>}
      </div>
    </div>
  );
}
