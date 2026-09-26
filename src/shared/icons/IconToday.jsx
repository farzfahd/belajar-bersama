export default function IconToday({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17" /><path d="M8 3.5v3M16 3.5v3" /><circle cx="12" cy="15" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
