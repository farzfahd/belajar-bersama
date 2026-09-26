export default function IconTasks({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="3.5" y="5.5" width="4.5" height="4.5" rx="1" /><rect x="3.5" y="14" width="4.5" height="4.5" rx="1" /><path d="M11 7.7h9.5M11 16.2h9.5" />
    </svg>
  );
}
