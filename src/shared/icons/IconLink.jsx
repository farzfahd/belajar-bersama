export default function IconLink({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" /><path d="M14.5 9.5 17 7a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" /><path d="M8.5 15.5l7-7" />
    </svg>
  );
}
