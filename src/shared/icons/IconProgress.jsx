export default function IconProgress({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4 19.5h16" /><rect x="5.5" y="13" width="3.2" height="5" rx="1" /><rect x="10.4" y="9" width="3.2" height="9" rx="1" /><rect x="15.3" y="4.5" width="3.2" height="13.5" rx="1" />
    </svg>
  );
}
