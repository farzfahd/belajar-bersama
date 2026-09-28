/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Nama kelas dipertahankan kompatibel dengan pemakaian yang sudah ada
        // (bg2/panel/panel2 dipakai di banyak className), tapi nilainya
        // ditunjuk ke token baru. Definisi token ada di index.css.
        bg: 'var(--bg)',
        bg2: 'var(--bg-sunken)',
        // `sunken` = nama yang dibaca di markup (kolom input / kode). Tanpa
        // kunci ini `bg-sunken` tidak pernah dibangun dan field form tampil
        // tanpa background sama sekali.
        sunken: 'var(--bg-sunken)',
        surface: 'var(--bg-elevated)',
        panel: 'var(--bg-elevated)',
        panel2: 'var(--bg-sunken)',
        elevated: 'var(--bg-elevated)',
        line: 'var(--border)',
        linestrong: 'var(--border-strong)',
        ink: 'var(--text)',
        dim: 'var(--text-dim)',
        dimmer: 'var(--text-dimmer)',
        accent: 'var(--accent)',
        accentsoft: 'var(--accent-soft)',
        accentsolid: 'var(--accent-solid)',
        onaccent: 'var(--on-accent)',
        ok: 'var(--ok)',
        oksoft: 'var(--ok-soft)',
        warn: 'var(--warn)',
        warnsoft: 'var(--warn-soft)',
        danger: 'var(--danger)',
        dangersoft: 'var(--danger-soft)'
      },
      boxShadow: {
        card: 'var(--shadow)',
        glow: 'var(--glow)',
        glowDanger: 'var(--glow-danger)'
      },
      fontFamily: {
        head: ['var(--font-head)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)']
      },
      borderRadius: {
        card: 'var(--radius)',
        smc: 'var(--radius-sm)'
      }
    }
  },
  plugins: []
};