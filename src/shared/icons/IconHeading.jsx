export default function IconHeading({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M6 5v14M14 5v14M6 12h8" /><path d="M17.5 19V9.8l2 1.4" />
    </svg>
  );
}
