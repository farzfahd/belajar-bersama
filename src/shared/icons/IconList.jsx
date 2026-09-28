export default function IconList({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.6" cy="6.5" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.6" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.6" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
