export default function IconBlocks({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="4.5" rx="1" /><rect x="3.5" y="10.2" width="10" height="4.5" rx="1" /><rect x="14.8" y="10.2" width="5.7" height="4.5" rx="1" /><rect x="3.5" y="15.4" width="6.5" height="4.5" rx="1" />
    </svg>
  );
}
