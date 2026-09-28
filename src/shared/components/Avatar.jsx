import { initialsOf } from '../utils/identity';

export default function Avatar({ name = '', color, size = 36, className = '' }) {
  // Warna identitas milik user (lihat IDENTITY.colors): nilai tengah-tengah
  // yang enak dilihat di atas isian 13% dari dirinya sendiri saat dark, tapi di
  // light isian itu menjadi sangat pucat dan teksnya hanya ~2:1 — gagal WCAG
  // AA. `color-mix` dengan `--text` menjaga nuansa warna user sekaligus
  // menggeser kontras: variabel `--text` gelap di light, terang di dark.
  const style = color
    ? {
        backgroundColor: `${color}22`,
        color: `color-mix(in srgb, ${color} 50%, var(--text))`,
        boxShadow: `inset 0 0 0 1px ${color}55`
      }
    : {
        backgroundColor: 'var(--bg-elevated)',
        color: 'var(--text-dim)',
        boxShadow: 'inset 0 0 0 1px var(--border)'
      };
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-head font-medium ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ...style }}
    >
      {initialsOf(name)}
    </span>
  );
}