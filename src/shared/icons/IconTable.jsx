export default function IconTable({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="3.8" y="4.8" width="16.4" height="14.4" rx="1.6" />
      <path d="M3.8 9.4h16.4M3.8 14.6h16.4M9.6 4.8v14.4" />
    </svg>
  );
}
