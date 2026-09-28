// Indikator memuat. `label` WAJIB tampil sebagai teks, bukan cuma `aria-label`:
// tiga halaman (attempt, hasil, rute kuis) mengoper label yang menjelaskan apa
// yang sedang dimuat, dan label itu dulu dibuang sehingga yang tampil hanya
// ring kecil tanpa keterangan apa pun.
//
// Bentuknya sengaja mono + uppercase seperti label lain di design system, dan
// memakai `inline-flex` supaya bisa diletakkan inline dengan konten lain
// (mis. di dalam EmptyState) maupun sendirian di tengah kolom.
export default function Spinner({ size = 18, label, className = '' }) {
  const ring = (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-line border-t-accent ${className}`}
      style={{ width: size, height: size }}
    />
  );
  if (!label) {
    return (
      <span role="status" aria-label="Memuat">
        {ring}
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-2 text-dimmer">
      {ring}
      <span className="font-mono text-[11px] uppercase tracking-[.08em]">{label}</span>
    </span>
  );
}
