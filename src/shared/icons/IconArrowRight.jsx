export default function IconArrowRight({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4.5 12h14" /><path d="M13 6.5 18.5 12 13 17.5" />
    </svg>
  );
}
