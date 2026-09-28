import { IconAchievements } from '../../../shared/icons';
import { Link } from 'react-router-dom';
import PageHeader from '../../../app/layout/PageHeader';
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
      <PageHeader
        eyebrow="learning berdua · pencapaian"
        icon={<IconAchievements size={26} />}
        title="Achievements"
        description="Badge dihitung dari materi, status belajar, dan materi yang sudah tersimpan di ruang ini."
        actions={
          <Link
            to="/progress"
            className="min-h-[44px] inline-flex items-center rounded-smc border border-line px-3 py-2 text-[12px] text-dim transition-colors hover:border-accent hover:text-accent"
          >
            Kembali ke Progress →
          </Link>
        }
      />

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
