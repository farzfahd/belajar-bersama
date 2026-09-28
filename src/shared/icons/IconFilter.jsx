// Corong/funnel untuk tombol filter.
//
// Pilihan gaya: corong (bukan sliders/equalizer) karena `IconSettings` sudah
// memakai motif "tiga garis + titik" — memakai pola yang sama untuk filter akan
// membuat keduanya mudah tertukar. Corong juga langsung terbaca sebagai
// "menyaring", bukan "menyesuaikan".
//
// Aturan sama seperti keluarga ikon lain (lihat index.js): viewBox 24x24,
// stroke 1.5, currentColor, linecap/linejoin round, target render 16-28px.
// Bentuk tutup di kiri-kanan supaya tidak tajam, dan tinggi gladly di tengah
// viewBox (y 4.5-19.5, bukan 3.5-20.5) supaya optik sejajar dengan huruf di
// sebelahnya — diuji lewat tests/layout-align.mjs.
export default function IconFilter({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4 5h16l-6.2 7.4v5.9l-3.6 1.7v-7.6z" />
    </svg>
  );
}
