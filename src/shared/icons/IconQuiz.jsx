export default function IconQuiz({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M5.5 3.5h9l4 4v13h-13z" /><path d="M14.5 3.5v4h4" /><path d="M8.8 13.2l2.2 2.2 4.2-4.8" />
    </svg>
  );
}
