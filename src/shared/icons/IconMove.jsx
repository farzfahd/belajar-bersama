export default function IconMove({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4 9h13M14 6l3 3-3 3" /><path d="M20 15H7M10 12l-3 3 3 3" />
    </svg>
  );
}
