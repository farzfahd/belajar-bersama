export default function IconChart({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4 4.5v15h15.5" /><path d="M7 15l3.5-4.5 3 2.5 4.5-6" />
    </svg>
  );
}
