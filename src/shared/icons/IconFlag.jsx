export default function IconFlag({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M6 20.5V4.2" /><path d="M6 5.2h11.8l-2.5 4 2.5 4H6z" />
    </svg>
  );
}
