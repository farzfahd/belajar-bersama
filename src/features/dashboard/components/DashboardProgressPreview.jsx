import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useProgressData } from '../../progress/hooks/useProgressData';
import { buildHeatmapWeeks } from '../../progress/utils/progressData';
import ActivityHeatmap from '../../progress/components/ActivityHeatmap';

export default function DashboardProgressPreview() {
  const { snapshot, loading, error } = useProgressData();
  const weeks = useMemo(() => buildHeatmapWeeks(snapshot.activity, 8), [snapshot.activity]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="db-label">Kontribusi mingguan</div>
          <h2 className="db-section-title mt-1">Heatmap Progress</h2>
        </div>
        <Link to="/progress" className="db-action">
          Buka Progress →
        </Link>
      </div>
      {error ? (
        <p className="db-label--meta text-accent">{error}</p>
      ) : loading && !snapshot.totalItems ? (
        <p className="db-label--meta">Memuat kontribusi…</p>
      ) : (
        <>
          <div className="db-label--meta mb-4 flex flex-wrap gap-x-6 gap-y-1">
            <span>{snapshot.activity.length} aktivitas tercatat</span>
            <span>{snapshot.score}% materi selesai</span>
          </div>
          <ActivityHeatmap weeks={weeks} compact />
        </>
      )}
    </section>
  );
}
