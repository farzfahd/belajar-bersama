const tones = {
  ok: 'border-[color-mix(in_srgb,var(--ok)_38%,transparent)] text-ok bg-[color-mix(in_srgb,var(--ok)_12%,transparent)]',
  warn: 'border-[color-mix(in_srgb,var(--warn)_38%,transparent)] text-warn bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]',
  accent: 'border-[color-mix(in_srgb,var(--accent)_38%,transparent)] text-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]',
  dim: 'border-line bg-bg2 text-dim'
};

export default function Badge({ children, tone = 'dim', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase leading-none tracking-[.06em] ${tones[tone] || tones.dim} ${className}`}
    >
      {children}
    </span>
  );
}