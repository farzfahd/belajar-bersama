import { Link } from 'react-router-dom';
import { useProgressData } from '../hooks/useProgressData';
import { buildAchievements } from '../utils/progressData';
import AchievementBadge from './AchievementBadge';
import { useSpace } from '../../space/hooks/useSpace';
import { spaceRoles } from '../../space/services/spaceService';

export default function AchievementsPage() {
  const { spaceId, uid, snapshot, loading, error, failedSources } = useProgressData();
  const { data: space } = useSpace(spaceId);
  const roles = spaceRoles(space, uid);
  const achievements = buildAchievements(snapshot, { partnerPresent: roles.filled });
  const unlocked = achievements.filter((achievement) => achievement.unlocked).length;

  if (loading && !snapshot.totalItems) {
    return <p className="py-12 text-center text-[13px] text-dim">Memuat pencapaian…</p>;
  }

  return (
    <div className="space-y-8">
      <header className="card flex flex-col gap-2">
        <div className="eyebrow">learning berdua · pencapaian</div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-head text-[26px] leading-tight text-ink">🏆 Achievements</h1>
            <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-dim">
              Badge dihitung dari materi, status belajar, dan materi yang sudah tersimpan di
              ruang ini.
            </p>
          </div>
          <Link to="/progress" className="min-h-[44px] rounded-smc border border-line px-3 py-2 text-[12px] text-dim transition-colors hover:border-accent hover:text-accent">
            Kembali ke Progress →
          </Link>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <span className="font-head text-3xl text-ink">{unlocked}<span className="text-dimmer">/{achievements.length}</span></span>
        <span className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">lencana terbuka</span>
        {roles.filled && <span className="font-mono text-[10px] uppercase tracking-[.06em] text-ok">ruang berdua</span>}
      </section>

      {error && (
        <p className="rounded-smc border border-[color-mix(in_srgb,var(--accent)_38%,transparent)] px-3 py-2 text-[12px] text-accent">
          {error} Badge di bawah mungkin tidak lengkap. Sumber: {failedSources.map((source) => source.label).join(', ')}.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {achievements.map((achievement) => <AchievementBadge key={achievement.key} achievement={achievement} />)}
      </section>
    </div>
  );
}
