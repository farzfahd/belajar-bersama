export default function IconWarn({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M12 4.5 20.5 19.5h-17z" /><path d="M12 10v4" /><circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
