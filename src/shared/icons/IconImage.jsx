export default function IconImage({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="M4 16.5 9.5 11.8l4 3.4 3-2.4 4 3.7" />
    </svg>
  );
}
