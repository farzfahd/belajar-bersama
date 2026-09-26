export default function IconRoadmap({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="5" cy="18.5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="5.5" r="2" /><path d="M6.6 17.1 10.4 13.4M13.6 10.6 17.4 7" />
    </svg>
  );
}
