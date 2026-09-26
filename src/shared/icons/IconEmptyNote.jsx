export default function IconEmptyNote({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5V8h4" /><path d="M9 12.5h6M9 16h4" />
    </svg>
  );
}
