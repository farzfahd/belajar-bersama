// Catatan status semantik untuk form & kartu. Satu tempat supaya warna
// selalu berarti hal yang sama:
//
//   danger = input/aksi tidak valid (butuh perbaikan)
//   warn   = belum lengkap / perlu lengkapi, tapi belum salah
//   ok     = sudah valid atau tersimpan
//   info   = informasi biasa / aksi aktif (bukan error)
//
// Warna diambil dari token yang sudah ada (--danger/--warn/--ok/--accent),
// fill-nya versi soft supaya tidak berubah jadi blok warna solid. Teks & ikon
// memakai `--*-ink` (lihat catatan token di index.css) karena warna status
// polos hanya ~4.1:1 di atas isian soft. Ikon SVG dari `shared/icons` — tidak
// ada emoji.
import { IconCheck, IconQuestion, IconWarn } from '../icons';

const TONES = {
  danger: {
    wrap: 'border-[color-mix(in_srgb,var(--danger)_34%,transparent)] bg-dangersoft',
    text: 'text-[color:var(--danger-ink)]',
    Icon: IconWarn
  },
  warn: {
    wrap: 'border-[color-mix(in_srgb,var(--warn)_34%,transparent)] bg-warnsoft',
    text: 'text-[color:var(--warn-ink)]',
    Icon: IconWarn
  },
  ok: {
    wrap: 'border-[color-mix(in_srgb,var(--ok)_34%,transparent)] bg-oksoft',
    text: 'text-[color:var(--ok-ink)]',
    Icon: IconCheck
  },
  info: {
    wrap: 'border-[color-mix(in_srgb,var(--accent)_34%,transparent)] bg-accentsoft',
    text: 'text-[color:var(--accent-ink)]',
    Icon: IconQuestion
  }
};

// `title` = satu kata penegas yang sering hilang kalau pesannya panjang
// (mis. "Keterangan terlalu panjang"). Baris judul memakai weight penuh supaya
// terbaca sebagai penanda, bukan sekadar kalimat biasa.
export default function StatusNote({ tone = 'info', title, children, className = '', id }) {
  const t = TONES[tone] || TONES.info;
  if (!children && !title) return null;
  return (
    <div
      id={id}
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-smc border px-2.5 py-2 text-[12px] leading-snug ${t.wrap} ${className}`}
    >
      <t.Icon size={14} className={`mt-px shrink-0 ${t.text}`} />
      <div className="min-w-0">
        {title && <p className={`font-semibold ${t.text}`}>{title}</p>}
        {children && <p className={`min-w-0 ${title ? 'mt-0.5' : ''} ${t.text}`}>{children}</p>}
      </div>
    </div>
  );
}
