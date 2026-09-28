export default function IconCopy({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.6" />
      <path d="M15.5 5.5H6.1A1.6 1.6 0 0 0 4.5 7.1v9.4" />
    </svg>
  );
}
