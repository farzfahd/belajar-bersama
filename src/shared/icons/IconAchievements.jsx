export default function IconAchievements({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <circle cx="12" cy="9.8" r="5" /><path d="M8.4 13.9 6.8 20.5 12 18l5.2 2.5-1.6-6.6" />
    </svg>
  );
}
