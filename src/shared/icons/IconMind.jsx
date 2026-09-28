export default function IconMind({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="12" cy="9.5" r="5.8" /><path d="M9.8 8.8h4.4M9.8 11.4h3" /><path d="M7.2 19.5c0-2.4 2.1-3.8 4.8-3.8s4.8 1.4 4.8 3.8" />
    </svg>
  );
}
