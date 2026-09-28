export default function IconCap({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M12 4.5 21 9l-9 4.5L3 9z" /><path d="M6.5 11v5c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-5" /><path d="M21 9v5" />
    </svg>
  );
}
