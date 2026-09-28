export default function IconNotes({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 4v16" /><path d="M12 8.5h4M12 12h4M12 15.5h3" />
    </svg>
  );
}
