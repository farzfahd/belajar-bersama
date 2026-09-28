// Panah ganda untuk toggle rail. `direction`:
//   'right' (>>) : rail ciut  -> klik untuk melebarkan
//   'left'  (<<) : rail lebar -> klik untuk menciutkan
// Dua chevron sejajar, bukan satu panah tunggal, supaya berbeda dari ikon
// back/next. Aturan sama dengan keluarga ikon lain: 24x24, stroke 1.5,
// currentColor, linecap/linejoin round.
export default function IconChevronExpand({ size = 20, className = '', direction = 'right' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {direction === 'right' ? (
        <>
          <path d="M8.5 8 12.5 12l-4 4" />
          <path d="M14 8l4 4-4 4" />
        </>
      ) : (
        <>
          <path d="M10 8 6 12l4 4" />
          <path d="M15.5 8 11.5 12l4 4" />
        </>
      )}
    </svg>
  );
}
