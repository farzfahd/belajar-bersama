export default function IconArrowUp({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M12 19.5V5" /><path d="M6 11l6-6 6 6" />
    </svg>
  );
}
