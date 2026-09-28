export default function IconDoc({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M8 3.5h8l4 4v11" /><path d="M4 7.5h8v11.5A1.5 1.5 0 0 1 10.5 20.5h-5A1.5 1.5 0 0 1 4 19z" />
    </svg>
  );
}
