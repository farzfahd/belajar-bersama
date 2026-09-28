export default function IconBook({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M5.5 5.2A2 2 0 0 1 7.5 3.6h9a2 2 0 0 1 2 2v14.8a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2z" /><path d="M9.5 8.5h5M9.5 12h5" />
    </svg>
  );
}
