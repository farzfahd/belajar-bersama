export default function IconEmptyResource({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M10.2 13.8a3.9 3.9 0 0 0 5.9.4l2.4-2.4a3.9 3.9 0 0 0-5.5-5.5l-1.3 1.3" /><path d="M13.8 10.2a3.9 3.9 0 0 0-5.9-.4l-2.4 2.4a3.9 3.9 0 0 0 5.5 5.5l1.3-1.3" />
    </svg>
  );
}
