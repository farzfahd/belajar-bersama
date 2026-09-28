import NavIcon from '../../shared/icons/NavIcon';
import EmptyState from '../../shared/ui/EmptyState';
import PageHeader from './PageHeader';

// Halaman placeholder untuk menu yang belum dibangun di Fase 1.
// `item.icon` adalah kunci string dari navConfig, bukan emoji — dirender
// lewat NavIcon supaya konsisten dengan sidebar.
export default function ComingSoonPage({ item }) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="learning berdua · fase 1"
        icon={<NavIcon name={item.icon} size={26} />}
        title={item.label}
      />
      <EmptyState
        icon={<NavIcon name={item.icon} size={32} />}
        title="Segera hadir"
        description={item.note}
      />
    </div>
  );
}