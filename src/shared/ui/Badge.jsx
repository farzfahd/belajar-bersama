// F2: badge tipis — border + fill soft, TIDAK solid warna terang.
// Radius 5px (bukan pill penuh); `pill` khusus untuk label status kecil
// seperti "kamu"/"partner" yang memang bulat.
// Teks memakai `--*-ink` (lihat catatan token di index.css): warna status
// polos hanya ~4.1:1 di atas isian soft, di bawah ambang 4.5:1.
const tones = {
  ok: 'border-[color-mix(in_srgb,var(--ok)_34%,transparent)] text-[color:var(--ok-ink)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]',
  warn: 'border-[color-mix(in_srgb,var(--warn)_34%,transparent)] text-[color:var(--warn-ink)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]',
  accent: 'border-[color-mix(in_srgb,var(--accent)_34%,transparent)] text-[color:var(--accent-ink)] bg-accentsoft',
  danger: 'border-[color-mix(in_srgb,var(--danger)_34%,transparent)] text-[color:var(--danger-ink)] bg-dangersoft',
  dim: 'border-line bg-elevated text-dim'
};

export default function Badge({ children, tone = 'dim', pill = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 border font-mono text-[10px] font-medium uppercase leading-none tracking-[.06em] ${
        pill ? 'rounded-full px-2.5 py-1' : 'rounded-[5px] px-2 py-[3px]'
      } ${tones[tone] || tones.dim} ${className}`}
    >
      {children}
    </span>
  );
}