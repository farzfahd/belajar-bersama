export default function EmptyState({ icon = '🗂️', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-linestrong bg-transparent px-6 py-12 text-center">
      <span className="text-3xl" aria-hidden="true">{icon}</span>
      <h3 className="font-head text-ink">{title}</h3>
      {description && <p className="max-w-sm text-[13px] leading-relaxed text-dim">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}