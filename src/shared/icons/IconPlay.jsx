export default function IconPlay({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" /><path d="M10.2 8.8 15.6 12l-5.4 3.2z" />
    </svg>
  );
}
