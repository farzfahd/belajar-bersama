export default function IconTarget({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3.6" /><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
