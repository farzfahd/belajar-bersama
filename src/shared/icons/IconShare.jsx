export default function IconShare({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="7" cy="12" r="2.6" /><circle cx="17.2" cy="6.6" r="2.1" /><circle cx="17.2" cy="17.4" r="2.1" /><path d="M9.4 10.9 15.2 7.7M9.4 13.1l5.8 3.2" />
    </svg>
  );
}
