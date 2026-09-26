export default function IconSearch({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l4.5 4.5" />
    </svg>
  );
}
