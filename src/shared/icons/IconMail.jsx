export default function IconMail({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2" />
      <path d="m3.8 6.6 8.2 6 8.2-6" />
    </svg>
  );
}
