export default function IconBold({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M7 5h5.6a3.4 3.4 0 0 1 0 6.8H7z" /><path d="M7 11.8h6.6a3.6 3.6 0 0 1 0 7.2H7z" />
    </svg>
  );
}
