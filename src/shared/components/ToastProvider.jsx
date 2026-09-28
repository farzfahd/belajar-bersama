import { IconCheck, IconClose, IconQuestion, IconWarn } from '../icons';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastCtx = createContext(null);

let seed = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (message, type = 'info') => {
      const id = ++seed;
      setToasts((list) => [...list.slice(-4), { id, message, type }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 4200)
      );
    },
    [dismiss]
  );

  const toast = useCallback(
    (message, type) => push(message, type),
    [push]
  );
  toast.success = (m) => push(m, 'success');
  toast.error = (m) => push(m, 'error');
  toast.info = (m) => push(m, 'info');

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed z-[300] inset-x-0 bottom-20 sm:bottom-6 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex min-h-[44px] items-center gap-3 rounded-smc border border-linestrong bg-panel px-4 py-2.5 shadow-card text-[13px] transition-colors duration-150"
            data-tone={t.type}
          >
            <span aria-hidden="true">
              {t.type === 'success' ? (
                <IconCheck size={17} />
              ) : t.type === 'error' ? (
                <IconWarn size={17} />
              ) : (
                <IconQuestion size={17} />
              )}
            </span>
            <span className="text-ink">{t.message}</span>
            <button
              type="button"
              aria-label="Tutup"
              onClick={() => dismiss(t.id)}
               className="flex h-11 w-11 items-center justify-center text-dim hover:text-ink transition-colors"
            >
              <IconClose size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastCtx);
  if (!toast) throw new Error('useToast wajib dipakai di dalam <ToastProvider>');
  return toast;
}