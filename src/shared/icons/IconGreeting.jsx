export default function IconGreeting({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4 19h16" /><path d="M7.5 15.5a4.5 4.5 0 0 1 9 0" /><path d="M12 4.5v2.2M5.6 7.4l1.6 1.6M18.4 7.4l-1.6 1.6" />
    </svg>
  );
}
