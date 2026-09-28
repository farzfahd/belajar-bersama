export default function IconGlobe({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" /><path d="M3.8 12h16.4" /><path d="M12 3.8c2.2 2.4 3.3 5.3 3.3 8.2s-1.1 5.8-3.3 8.2c-2.2-2.4-3.3-5.3-3.3-8.2S9.8 6.2 12 3.8z" />
    </svg>
  );
}
