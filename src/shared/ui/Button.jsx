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
  const variants = {
    primary: 'bg-ink text-bg font-semibold hover:opacity-90',
    ghost: 'bg-transparent text-ink border border-line hover:border-linestrong',
    danger: 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent border border-[color-mix(in_srgb,var(--accent)_38%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]',
    subtle: 'bg-transparent text-dim hover:text-ink'
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
       className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-smc font-semibold transition-[color,background-color,border-color,opacity] duration-150 disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}