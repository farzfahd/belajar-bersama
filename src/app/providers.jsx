import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadThemeFonts } from './themeFonts';
import { DEFAULT_COLOR_THEME, isColorTheme } from './themes';

// Dua sumbu INDEPENDEN, bukan satu nilai enum:
//   - colorTheme: tema warna + font (default | pastel | rose | forest | mono | ocean)
//   - mode:       terang/gelap DI DALAM tema itu (light | dark)
// Kunci localStorage juga terpisah, jadi mengganti tema tidak mereset mode
// (dan sebaliknya) — Persis seperti yang ditulis di docs/PROGRESS.md.
//
// Nilai yang sudah dipasang inline script themeBoot.js SEBELUM render pertama
// di-read lagi di sini, supaya React dan DOM tidak pernah berbeda state
// (tanpa flash saat mount).

const ThemeCtx = createContext(null);

const MODE_KEY = 'lb:theme';
const COLOR_KEY = 'lb:colorTheme';

function initialMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    return 'dark';
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function initialColorTheme() {
  try {
    const saved = localStorage.getItem(COLOR_KEY);
    if (isColorTheme(saved)) return saved;
  } catch {
    return DEFAULT_COLOR_THEME;
  }
  return DEFAULT_COLOR_THEME;
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(initialMode);
  const [colorTheme, setColorThemeState] = useState(initialColorTheme);

  useEffect(() => {
    const root = document.documentElement;
    // Dua atribut ini adalah SATU-SATUNYA sumber token tema: seluruh blok di
    // src/index.css memakai selector `[data-color-theme=…][data-mode=…]`.
    // Kalau salah satu tidak di-set di sini, pergantian tema tidak terlihat
    // sama sekali padahal state React sudah berubah.
    root.dataset.colorTheme = colorTheme;
    root.dataset.mode = mode;
    // Class `dark` dipertahankan agar tetap sinkron dengan `darkMode: 'class'`
    // di tailwind.config.js, walau saat ini tidak ada variant `dark:` yang dipakai.
    root.classList.toggle('dark', mode === 'dark');

    // theme-color mengikuti --bg yang SEDANG berlaku, jadi bilah/status bar
    // browser ikut berubah untuk semua 12 kombinasi (nilai lama di-hardcode
    // hanya benar untuk tema default). themeBoot.js melakukan hal yang sama satu
    // kali sebelum frame pertama; di sini diulang setiap mode/tema berubah.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
      if (bg) meta.setAttribute('content', bg);
    }

    try {
      localStorage.setItem(MODE_KEY, mode);
      // WAJIB disimpan di sini juga (bukan hanya dibaca): kalau tidak, tema
      // yang dipilih selalu kembali ke default setelah reload, karena
      // ThemeProvider selalu mulai ulang dari localStorage.
      localStorage.setItem(COLOR_KEY, colorTheme);
    } catch {
      // preferensi tampilan bukan data sensitif; abaikan error penyimpanan
    }
  }, [mode, colorTheme]);

  useEffect(() => {
    loadThemeFonts(colorTheme);
  }, [colorTheme]);

  const setColorTheme = useCallback((id) => {
    if (isColorTheme(id)) setColorThemeState(id);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, toggleMode, colorTheme, setColorTheme }),
    [mode, colorTheme, toggleMode, setColorTheme]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme wajib dipakai di dalam <ThemeProvider>');
  return ctx;
}
