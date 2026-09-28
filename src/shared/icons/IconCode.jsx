export default function IconCode({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M8.5 8 4 12l4.5 4" /><path d="M15.5 8 20 12l-4.5 4" /><path d="M13.5 5.5l-3 13" />
    </svg>
  );
}
