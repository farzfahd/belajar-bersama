export default function IconSwap({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4 8.5h13.5" /><path d="M14.5 5.5l3 3-3 3" />
      <path d="M20 15.5H6.5" /><path d="M9.5 12.5l-3 3 3 3" />
    </svg>
  );
}
