import { createContext, useContext, useEffect, useState } from 'react';

const ThemeCtx = createContext(null);

const STORAGE_KEY = 'lb:theme';

function initialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    return 'dark';
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
     root.classList.toggle('dark', theme === 'dark');
     root.dataset.theme = theme;
     const themeColor = document.querySelector('meta[name="theme-color"]');
     if (themeColor) themeColor.setAttribute('content', theme === 'dark' ? '#1a1714' : '#f6f1e7');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // tema bukan data sensitif; abaikan error penyimpanan
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme wajib dipakai di dalam <ThemeProvider>');
  return ctx;
}