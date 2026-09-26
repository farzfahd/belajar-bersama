import { initialsOf } from '../utils/identity';

export default function Avatar({ name = '', color, size = 36, className = '' }) {
  const style = color
    ? {
        backgroundColor: `${color}22`,
        color,
        boxShadow: `inset 0 0 0 1px ${color}55`
      }
    : {
        backgroundColor: 'var(--panel2)',
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