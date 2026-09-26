export default function Spinner({ size = 18, className = '' }) {
  return (
    <span
      role="status"
      aria-label="Memuat"
      className={`inline-block animate-spin rounded-full border-2 border-line border-t-accent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}