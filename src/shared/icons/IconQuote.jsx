export default function IconQuote({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4.5 12.5C4.5 8.9 7.3 6 10.8 6v2.6c-1.9.3-3.2 1.6-3.4 3.4h3.4v6H4.5z" /><path d="M13.5 12.5C13.5 8.9 16.3 6 19.8 6v2.6c-1.9.3-3.2 1.6-3.4 3.4h3.4v6h-6.3z" />
    </svg>
  );
}
