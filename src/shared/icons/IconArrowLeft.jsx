export default function IconArrowLeft({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M12 4.5V19" /><path d="M18 11l-6 6-6-6" />
    </svg>
  );
}
