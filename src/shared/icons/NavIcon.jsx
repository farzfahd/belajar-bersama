import { ICONS } from './index';

// Render ikon navigasi berdasarkan kunci string dari navConfig.
// Dipisah jadi komponen karena JSX tidak bisa menulis `<ICONS[k] />`.
export default function NavIcon({ name, size = 18, className = '' }) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return (
    <span className={`inline-flex shrink-0 ${className}`.trim()} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}
