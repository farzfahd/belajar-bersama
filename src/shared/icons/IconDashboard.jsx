export default function IconDashboard({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="9.5" height="17" rx="1.5" /><rect x="15" y="3.5" width="5.5" height="7.5" rx="1.5" /><rect x="15" y="13" width="5.5" height="7.5" rx="1.5" />
    </svg>
  );
}
