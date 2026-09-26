/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        bg2: 'var(--bg2)',
        surface: 'var(--surface)',
        panel: 'var(--panel)',
        panel2: 'var(--panel2)',
        line: 'var(--border)',
        linestrong: 'var(--border-strong)',
        ink: 'var(--text)',
        dim: 'var(--text-dim)',
        dimmer: 'var(--text-dimmer)',
        accent: 'var(--accent)',
        ok: 'var(--ok)',
        warn: 'var(--warn)'
      },
      fontFamily: {
        head: ['var(--font-head)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)']
      },
      borderRadius: {
        card: 'var(--radius)',
        smc: 'var(--radius-sm)'
      },
      boxShadow: {
        card: 'var(--shadow)'
      }
    }
  },
  plugins: []
};