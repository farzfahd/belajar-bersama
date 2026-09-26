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
          <div className="eyebrow">kontribusi · snapshot</div>
          <h2 className="section-title mb-0 mt-1">Heatmap Progress</h2>
        </div>
        <Link to="/progress" className="min-h-[44px] rounded-smc border border-line px-3 py-2 text-[12px] text-dim transition-colors hover:border-accent hover:text-accent">
          Buka Progress →
        </Link>
      </div>
      {error ? (
        <p className="text-[12px] text-accent">{error}</p>
      ) : loading && !snapshot.totalItems ? (
        <p className="text-[12px] text-dim">Memuat kontribusi…</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">
            <span>{snapshot.activity.length} aktivitas tercatat</span>
            <span>{snapshot.score}% materi selesai</span>
          </div>
          <ActivityHeatmap weeks={weeks} compact />
        </>
      )}
    </section>
  );
}
