import EmptyState from '../../shared/ui/EmptyState';

// Halaman placeholder untuk menu yang belum dibangun di Fase 1.
export default function ComingSoonPage({ item }) {
  return (
    <div className="space-y-6">
      <header className="card flex flex-col gap-1">
        <div className="eyebrow">learning berdua · fase 1</div>
        <h1 className="font-head text-2xl text-ink">
          {item.icon} {item.label}
        </h1>
      </header>
      <EmptyState
        icon={item.icon}
        title="Segera hadir"
        description={item.note}
      />
    </div>
  );
}