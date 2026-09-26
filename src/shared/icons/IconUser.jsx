export default function IconUser({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.8" /><path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" />
    </svg>
  );
}
