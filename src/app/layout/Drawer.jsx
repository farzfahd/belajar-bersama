import { useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuthState } from '../../features/auth/hooks/useAuthState';
import { useProfile } from '../../features/auth/hooks/useProfile';
import { NAV, isNavItemActive } from './navConfig';
import Avatar from '../../shared/components/Avatar';

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
  if (!container?.contains(document.activeElement)) {
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

// Drawer menu mobile: seluruh item nav (yang tidak masuk bottom-nav).
export default function Drawer({ open, onClose }) {
  const { pathname } = useLocation();
  const { user } = useAuthState();
  const me = useProfile(user?.uid);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const frame = window.requestAnimationFrame(() => {
      (closeRef.current || dialogRef.current)?.focus();
    });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      trapFocus(e, dialogRef.current);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] min-[860px]:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
       <div
         className="absolute inset-0 bg-[rgba(26,23,20,.68)]"
         aria-hidden="true"
         onMouseDown={() => onClose()}
       />

       <div
         ref={dialogRef}
         role="dialog"
         aria-modal="true"
         aria-label="Menu"
         tabIndex={-1}
         style={{ paddingLeft: 'env(safe-area-inset-left)' }}
         className="view-in absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col border-r border-line bg-bg"
       >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="font-head text-[16px] font-medium leading-none text-ink">
              Belajar Bersama
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[.08em] text-dimmer">
              menu lengkap
            </div>
          </div>
           <button ref={closeRef} type="button" aria-label="Tutup menu" onClick={onClose} className="icon-btn">
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3" aria-label="Menu lengkap">
          {NAV.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              end={item.path === '/dashboard'}
              onClick={onClose}
               className={() =>
                 `flex min-h-[44px] items-center gap-3 border-l-2 px-4 py-2 text-[13.5px] transition-colors ${
                   isNavItemActive(item, pathname)
                    ? 'border-l-accent font-semibold text-ink'
                    : 'border-l-transparent text-dim hover:border-l-linestrong hover:text-ink'
                }`
              }
            >
              <span aria-hidden="true" className="text-[15px]">
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
              {item.comingSoon && (
                <span className="ml-auto font-mono text-[9px] uppercase tracking-[.08em] text-dimmer">
                  nanti
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/settings"
          onClick={onClose}
           className="flex min-h-[44px] items-center gap-3 border-t border-line px-4 py-3"
        >
          <Avatar name={me.data?.displayName} color={me.data?.color} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">
              {me.data?.displayName || '…'}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">
              kamus profil
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}