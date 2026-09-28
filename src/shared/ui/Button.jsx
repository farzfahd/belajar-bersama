import Spinner from '../components/Spinner';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  disabled = false,
  type = 'button',
  ...rest
}) {
// F1-F2: skema warna global (indigo/navy) + gaya tombol "border + soft fill".
// Primary TIDAK lagi solid terang: border accent + fill --accent-soft, dengan
// glow tipis hanya saat hover/focus. Label memakai `--*-ink` karena warna status
// polos hanya ~4.1:1 di atas isian soft (butuh 4.5:1 untuk teks kecil).
const variants = {
  primary:
    'border border-accent bg-accentsoft text-[color:var(--accent-ink)] font-semibold hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-glow focus-visible:shadow-glow',
  ghost:
    'border border-line bg-transparent text-ink hover:border-linestrong hover:bg-elevated',
  subtle:
    'border border-transparent bg-transparent text-dim hover:border-line hover:text-ink',
  danger:
    'border border-danger bg-dangersoft text-[color:var(--danger-ink)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:shadow-glowDanger focus-visible:shadow-glowDanger'
};
  const sizes = {
    sm: 'px-3 py-1.5 text-[12.5px]',
    md: 'px-4 py-2.5 text-[14px]',
    lg: 'px-5 py-3 text-[15px]'
  };
  return (
    <button
      type={type}
      disabled={disabled || loading}
       className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-smc font-medium transition-[color,background-color,border-color,box-shadow] duration-150 disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${variants[variant] || variants.ghost} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}