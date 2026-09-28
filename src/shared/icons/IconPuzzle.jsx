export default function IconPuzzle({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="4" y="4" width="9" height="9" rx="1.5" /><rect x="11" y="11" width="9" height="9" rx="1.5" />
    </svg>
  );
}
