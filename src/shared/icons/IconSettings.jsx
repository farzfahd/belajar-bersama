export default function IconSettings({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4 7.5h16M4 12h16M4 16.5h16" /><circle cx="9" cy="7.5" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="7.5" cy="16.5" r="2" />
    </svg>
  );
}
