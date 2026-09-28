import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Tooltip ringan untuk hover di desktop.
//
// Tiga keputusan penting di sini:
// 1. Delay 150ms saat MASUK supaya tooltip tidak berkedip ketika pointer
//    cuma lewat cepat. Saat KELUAR hilang seketika (tanpa delay) —
//    menunda tooltip membuat terasa "nyangkut" di kursor.
// 2. Wrapper memakai `display: contents` supaya TIDAK ikut menjadi box
//    layout (rail ini flex column; span biasa akan jadi flex item baru dan
//    merusak tinggi baris). Karena wrapper tidak punya box, yang diukur
//    adalah elemen anak pertamanya.
// 3. Dirender lewat portal ke <body> dengan position: fixed. Kalau tooltip
//    diletakkan di dalam rail yang overflow-y: auto, browser memotong
//    horizontal saat daftar nav panjang — portal + koordinat fixed bebas.
const DELAY_MS = 150;
const OFFSET_PX = 8;

// Sengaja tidak memakai token warna baru: mengikuti token global
// (--bg-elevated, --border, --text) yang sama dengan rail.
export default function Tooltip({ label, id, delay = DELAY_MS, offset = OFFSET_PX, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef(null);
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), delay);
  }, [clearTimer, delay]);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  // Kalau daftar digulir saat tooltip terbuka, anchor ikut bergeser. Lebih
  // aman menutup tooltip daripada membiarkannya menggantung di posisi lama.
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => clearTimer, [clearTimer]);

  useLayoutEffect(() => {
    if (!open) return;
    // Wrapper ber-display:contents tidak punya box -> ukur elemen anaknya.
    const anchor = anchorRef.current?.firstElementChild;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    // Vertikal: tengah anchor. Penyesuaian -50% dilakukan via class CSS.
    setPos({ top: r.top + r.height / 2, left: r.right + offset });
  }, [open, offset]);

  return (
    <>
      <span
        ref={anchorRef}
        className="contents"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            style={{ top: pos.top, left: pos.left }}
            className="tooltip-pop pointer-events-none fixed z-[300] -translate-y-1/2 whitespace-nowrap rounded-[4px] border border-line bg-elevated px-2.5 py-1.5 text-[12px] leading-none text-ink"
          >
            {label}
          </span>,
          document.body
        )}
    </>
  );
}
