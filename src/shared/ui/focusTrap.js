// Fokus + focus trap untuk overlay (Modal, Drawer, FilterPanel).
// Diekstrak dari Modal.jsx supaya logikanya tidak disalin ulang di setiap
// overlay baru — tiga komponen sudah memakainya.

export const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function getFocusable(container) {
  return Array.from(container?.querySelectorAll(FOCUSABLE) || []);
}

// Tab dipantul di dalam `container`: fokus tidak pernah keluar ke luar overlay.
export function trapFocus(e, container) {
  if (e.key !== 'Tab' || !container) return;
  const focusable = getFocusable(container);
  if (focusable.length === 0) {
    e.preventDefault();
    container.focus();
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
