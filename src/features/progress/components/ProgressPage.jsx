import { IconProgress } from '../../../shared/icons';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../app/layout/PageHeader';
import { useProgressData } from '../hooks/useProgressData';
import {
  ACTIVITY_TIME_ZONE,
  buildHeatmapWeeks,
  buildHistoryGroups,
  buildHourGrid,
  formatDayKey,
  formatWeekRange,
  startOfWeekKey
} from '../utils/progressData';
import ActivityHeatmap from './ActivityHeatmap';
import HistoryGrid from './HistoryGrid';
import ProgressChart from './ProgressChart';
import Badge from '../../../shared/ui/Badge';
import { statusLabel } from '../../../shared/utils/status';
import { useSpace } from '../../space/hooks/useSpace';
import { spaceRoles } from '../../space/services/spaceService';

function Stat({ value, label }) {
  return (
    <div className="border-b border-line py-3 first:border-t">
      <div className="font-head text-[26px] leading-none text-ink">{value}</div>
      <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[.06em] text-dimmer">{label}</div>
    </div>
  );
}

function eventTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('id-ID', {
    timeZone: ACTIVITY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function HistoryRow({ event, uid, topicIds }) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[9px] uppercase tracking-[.06em] text-dimmer">
          {eventTime(event.timestamp)} · {event.actorId === uid ? 'kamu' : event.actorId ? 'partner' : 'ruang'} · {event.entityType}
        </div>
        <h3 className="mt-0.5 truncate text-[13px] font-medium text-ink">{event.title}</h3>
      </div>
      <Badge tone={event.tone || 'dim'}>{statusLabel(event.status)}</Badge>
    </>
  );
  const rowClass = 'flex min-h-[58px] items-center gap-3 border-b border-l-2 border-line border-l-accent py-2 pl-2';
  if (event.topicId && topicIds.has(event.topicId)) {
    return (
      <Link to={`/roadmap/${event.topicId}`} className={`${rowClass} transition-colors hover:bg-bg2`}>
        {content}
      </Link>
    );
  }
  return <div className={rowClass}>{content}</div>;
}

export default function ProgressPage() {
  const { spaceId, uid, snapshot, series, loading, error, failedSources } = useProgressData();
  const { data: space } = useSpace(spaceId);
  const roles = spaceRoles(space, uid);
  const weeks = useMemo(() => buildHeatmapWeeks(snapshot.activity, 12), [snapshot.activity]);
  const hourGrid = useMemo(() => buildHourGrid(snapshot.activity), [snapshot.activity]);
  const history = useMemo(() => buildHistoryGroups(snapshot.activity), [snapshot.activity]);
  const topicIds = useMemo(() => new Set(snapshot.topics.map((topic) => topic.id)), [snapshot.topics]);

  if (loading && !snapshot.totalItems) {
    return <p className="py-12 text-center text-[13px] text-dim">Memuat statistik ruang…</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="learning berdua · statistik"
        icon={<IconProgress size={26} />}
        title="Progress"
        description={`Snapshot materi dan perubahan tersimpan di ruang ${space?.name || 'belajar'}. Data private hanya dihitung setelah difilter untuk pengguna ini.`}
        actions={
          <Link
            to="/achievements"
            className="min-h-[44px] inline-flex items-center rounded-smc border border-line px-3 py-2 text-[12px] text-dim transition-colors hover:border-accent hover:text-accent"
          >
            Lihat achievements →
          </Link>
        }
      />

      {error && (
        <p className="rounded-smc border border-[color-mix(in_srgb,var(--accent)_38%,transparent)] px-3 py-2 text-[12px] text-accent">
          {error} Statistik di bawah mungkin tidak lengkap. Sumber: {failedSources.map((source) => source.label).join(', ')}.
        </p>
      )}

      <section className="grid grid-cols-2 gap-x-5 sm:grid-cols-4">
        <Stat value={snapshot.totalItems} label="total materi" />
        <Stat value={snapshot.completedItems} label="materi selesai" />
        <Stat value={`${snapshot.score}%`} label="skor materi" />
        <Stat value={snapshot.activity.length} label="snapshot aktivitas" />
      </section>

      <section className="card">
        <ProgressChart lineData={series} barData={snapshot.phaseCounts} />
      </section>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">heatmap · 12 minggu</div>
            <h2 className="font-head text-xl text-ink">Kontribusi materi</h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">dari data topics · notes · resources · states</span>
        </div>
        <ActivityHeatmap weeks={weeks} />
      </section>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">riwayat · jurnal</div>
            <h2 className="font-head text-xl text-ink">Riwayat perubahan</h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">{roles.filled ? 'dua anggota' : 'satu anggota'}</span>
        </div>
        <HistoryGrid grid={hourGrid} />
        <div className="mt-6 space-y-1">
          {history.length ? history.map((group, groupIndex) => {
            const previous = history[groupIndex - 1];
            const showWeek = !previous || previous.weekNumber !== group.weekNumber;
            return (
              <div key={group.key}>
                {showWeek && (
                  <div className="flex items-baseline justify-between gap-3 border-b border-linestrong py-4">
                    <span className="font-head text-2xl text-accent">Minggu {group.weekNumber}</span>
                    <span className="font-mono text-[9px] uppercase tracking-[.05em] text-dimmer">{formatWeekRange(startOfWeekKey(group.key))}</span>
                  </div>
                )}
                <div className="mb-3 mt-2 flex items-center gap-3">
                  <time className="w-[86px] shrink-0 font-mono text-[10px] uppercase tracking-[.04em] text-dimmer" dateTime={group.key}>
                    {formatDayKey(group.key, { weekday: 'short', day: '2-digit', month: 'short' })}
                  </time>
                  <span className="h-px flex-1 bg-line" />
                </div>
                {group.events.map((event) => <HistoryRow key={event.id} event={event} uid={uid} topicIds={topicIds} />)}
              </div>
            );
          }) : (
            <p className="py-8 text-center text-[13px] text-dim">Belum ada perubahan materi yang bisa ditampilkan.</p>
          )}
        </div>
      </section>
    </div>
  );
}
