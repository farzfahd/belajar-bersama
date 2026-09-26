export default function IconProjects({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M12 3.2l8.3 4.3v9L12 20.8 3.7 16.5v-9z" /><path d="M12 12l8.3-4.5M12 12v8.8M12 12 3.7 7.5" />
    </svg>
  );
}
