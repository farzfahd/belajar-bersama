import { IconClose, IconFilter } from '../icons';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import { getFocusable, trapFocus } from './focusTrap';

// Panel filter terpusat: satu tombol ikon + panel berisi semua kontrol filter.
//
// Dua tampilan dipilih sesuai breakpoint (bukan dua render yang disembunyikan
// lewat CSS) supaya hanya satu DOM yang hidup pada satu waktu — fokus, Escape,
// dan scroll lock jadi tidak perlu bercabang:
//   - mobile  (<860px): bottom sheet, tinggi sesuai isi, maks 80vh.
//   - desktop (>=860px): popover 320px mengambang di bawah tombol.
//
// Filter tetap berlaku LANGSUNG saat diubah (live), jadi tidak ada state
//Values yang bisa tercecer. Tombol "Terapkan" di sheet hanya penutup eksplisit.
// Durasi harus SAMA PERSIS dengan yang ditulis di index.css, karena kita
// tidak menunggu event `animationend` (panel bisa di-unmount / di-repaint
// duluan). Nilai dengan buffer tipis supaya panel tidak sempat berkedip.
const DUR_SHEET = 170;
const DUR_POP = 130;

export default function FilterPanel({ filters = [], activeCount = 0, onReset, title = 'Filter' }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false); // animasi keluar sedang main
  const [sheet, setSheet] = useState(false); // true = <860px
  const [pos, setPos] = useState(null); // posisi popover desktop

  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const titleId = useId();
  const openRef = useRef(open);
  openRef.current = open;
  const closingRef = useRef(closing);
  closingRef.current = closing;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;
  // Durasi animasi KELUAR yang cocok dengan mode saat panel ditutup.
  const durRef = useRef(DUR_POP);

  // Menutup = mainkan animasi keluar dulu, baru unmount. Scroll lock, focus
  // trap, dan listener tetap hidup selama itu karena semuanya terikat ke
  // `open` (yang baru berubah di akhir).
  const close = useCallback(() => {
    if (!openRef.current || closingRef.current) return;
    // reduced motion: jangan menunda panel hilang.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOpen(false);
      return;
    }
    durRef.current = sheet ? DUR_SHEET : DUR_POP;
    setClosing(true);
  }, [sheet]);

  // Durasi animasi keluar disimpan saat `close()` dipanggil, jadi perubahan
  // breakpoint di tengah animasi tidak mengacaukan timing.
  useEffect(() => {
    if (!closing) return undefined;
    const t = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, durRef.current);
    return () => window.clearTimeout(t);
  }, [closing]);

  // Breakpoint lewat matchMedia, bukan CSS saja: sheet dan popover punya
  // struktur DOM berbeda (handle/header/footer vs tidak), jadi mode-nya harus
  // diketahui di JS untuk render + focus management yang benar.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 860px)');
    const sync = () => setSheet(!mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Desktop: hitung posisi popover dari tombol + collision detection.
  // Setelah render, supaya tinggi panel sudah diketahui.
  useLayoutEffect(() => {
    if (!open || sheet) return undefined;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 320;
      const gap = 8;
      const margin = 8;
      // Rata kiri dengan tombol; kalau meluber ke kanan, geser jadi rata kanan.
      let left = r.left;
      if (left + width > window.innerWidth - margin) left = r.right - width;
      // Terakhir, jepit agar tidak keluar viewport sama sekali.
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      // Kalau tidak muat di bawah, naikkan ke atas daripada terpotong.
      const estHeight = panelRef.current?.offsetHeight || 320;
      const below = window.innerHeight - r.bottom - gap;
      const top =
        below < Math.min(estHeight, 240) && r.top - gap - estHeight > margin
          ? Math.max(margin, r.top - gap - estHeight)
          : r.bottom + gap;
      setPos({ left, top, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, sheet]);

  // Fokus + keyboard + scroll lock selama panel terbuka.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    if (sheet) document.body.style.overflow = 'hidden'; // cegah scroll ganda

    const frame = window.requestAnimationFrame(() => {
      const target = getFocusable(panelRef.current)[0] || panelRef.current;
      target?.focus();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      trapFocus(e, panelRef.current);
    };
    document.addEventListener('keydown', onKey);

    // Desktop: klik di luar popover menutup. Mobile: backdrop yang menutup
    // (sudah ditangani di JSX). Selama animasi KELUAR listener dicopot supaya
    // klik berikutnya tidak menumpuk animasi baru.
    const onPointerDown = (e) => {
      if (sheet || !openRef.current || closingRef.current) return;
      if (panelRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      close();
    };
    if (!sheet) document.addEventListener('mousedown', onPointerDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      // Fokus SELALU kembali ke tombol trigger (bukan ke elemen yang kebetulan
      // fokus sebelum dibuka): trigger adalah asal mula panel ini, dan
      // programmatic click tidak memindahkan fokus sehingga `previous` bisa
      // saja `body`. Fallback ke `previous` dipakai hanya bila trigger sudah
      // tidak ter-mount.
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
      else if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open, sheet, close]);

  const active = activeCount > 0;
  // --- Tombol trigger (ikon + badge jumlah filter aktif) -------------------
  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => {
        // Toggle: kalau sedang menutup, batalkan animasi dan buka lagi
        // daripada menunggu selesai dulu.
        if (open && closing) {
          setClosing(false);
          return;
        }
        if (open) close();
        else setOpen(true);
      }}
      aria-haspopup="dialog"
      aria-expanded={open && !closing}
      aria-label={active ? `Filter (${activeCount} aktif)` : 'Filter'}
      title={active ? `Filter — ${activeCount} aktif` : 'Filter'}
      className="icon-btn relative shrink-0"
    >
      <IconFilter size={20} />
      {active && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accentsolid px-1 font-mono text-[9px] font-semibold leading-none text-onaccent"
        >
          {activeCount}
        </span>
      )}
    </button>
  );

  // --- Isi panel (dipakai bersama oleh sheet & popover) -------------------
  const body = (
    <div className="flex flex-col gap-4">
      {filters.map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          {/* Label selalu tampil di atas select. Di dalam panel berbeda dengan
              toolbar lama yang hanya mengandalkan aria-label tanpa teks. */}
          <span className="eyebrow">{f.label}</span>
          {f.node}
        </div>
      ))}
    </div>
  );

  // --- Mobile (<860px): bottom sheet --------------------------------------
  // Trigger tetap di-mount (di luar portal) supaya fokus selalu bisa kembali
  // ke sana saat sheet ditutup; sheet-nya sendiri yang di-portal ke body.
  if (open && sheet) {
    return (
      <>
        {trigger}
        {createPortal(
          <div className="fixed inset-0 z-[190] flex items-end">
            <div
              aria-hidden="true"
              onMouseDown={close}
              className={`sheet-backdrop absolute inset-0 bg-[var(--scrim)] ${closing ? 'sheet-backdrop-out' : ''}`}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className={`relative flex max-h-[80vh] w-full flex-col rounded-t-xl border-t border-line bg-elevated ${
                closing ? 'sheet-out' : 'sheet-in'
              }`}
            >
              {/* Handle: penanda visual saja, bukan drag-to-dismiss. */}
              <div aria-hidden="true" className="flex shrink-0 justify-center pt-2.5">
                <span className="h-1 w-9 rounded-full bg-linestrong" />
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-4">
                <h2 id={titleId} className="font-head text-lg leading-none text-ink">
                  {title}
                </h2>
                <button type="button" onClick={close} aria-label="Tutup filter" className="icon-btn shrink-0">
                  <IconClose size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{body}</div>
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-5 py-3.5">
                {/* Reset TIDAK menutup sheet: user harus melihat hasilnya langsung. */}
                <Button variant="ghost" onClick={() => onResetRef.current?.()}>
                  Reset
                </Button>
                <Button onClick={close}>Terapkan</Button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  // --- Desktop (>=860px): popover mengambang ------------------------------
  // Tanpa tombol "Terapkan": popover sudah tertutup sendiri saat klik di luar,
  // jadi tombol itu hanya jadi kebingungan. "Reset" tetap ada.
  return (
    <>
      {trigger}
      {open &&
        !sheet &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={title}
            tabIndex={-1}
            style={{
              position: 'fixed',
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              width: pos?.width ?? 320
            }}
            className={`z-[190] flex max-h-[min(70vh,420px)] flex-col overflow-hidden rounded-card border border-linestrong bg-elevated ${
              closing ? 'pop-out' : 'pop-in'
            }`}
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{body}</div>
            <div className="flex shrink-0 items-center border-t border-line px-4 py-3">
              <Button variant="ghost" size="sm" onClick={() => onResetRef.current?.()}>
                Reset
              </Button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
