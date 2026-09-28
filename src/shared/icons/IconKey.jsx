export default function IconKey({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="8" cy="12" r="3.6" /><path d="M11.6 12h8.4M17.2 12v3.2M20 12v2.2" />
    </svg>
  );
}
