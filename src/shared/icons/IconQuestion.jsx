export default function IconQuestion({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" /><path d="M9.6 9.8a2.5 2.5 0 0 1 4.9.6c0 1.7-2.4 2.1-2.4 3.6" /><circle cx="12.1" cy="16.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
