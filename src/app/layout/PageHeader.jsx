// Header bersama halaman dalam aplikasi.
// Memastikan alignment horizontal ikon + judul (line-height: 1),
// hierarki eyebrow di atas, deskripsi di bawah, dan aksi fleksibel.
export default function PageHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  className = ''
}) {
  return (
    <header
      className={`card flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`.trim()}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="flex items-center gap-3">
          {icon && (
            <span
              className="flex shrink-0 items-center justify-center text-ink"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
          <h1 className="font-head text-2xl leading-none text-ink">{title}</h1>
        </div>
        {description && (
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-dim">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:self-start">
          {actions}
        </div>
      )}
    </header>
  );
}
