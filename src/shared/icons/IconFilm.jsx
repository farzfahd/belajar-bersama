export default function IconFilm({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M3.5 9.5h17M3.5 14.5h17M8 5.5v13M16 5.5v13" />
    </svg>
  );
}
