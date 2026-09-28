export default function IconChecklist({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M3 6.6l1.8 1.8L8 5" /><path d="M3 16.6l1.8 1.8L8 15" /><rect x="12" y="5" width="9" height="4.5" rx="1" /><rect x="12" y="15" width="9" height="4.5" rx="1" />
    </svg>
  );
}
