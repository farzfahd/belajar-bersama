import Badge from '../../../shared/ui/Badge';

export default function AchievementBadge({ achievement }) {
  return (
    <article
      className={`rounded-[12px] border p-4 ${
        achievement.unlocked ? 'border-accent bg-bg2' : 'border-line bg-bg2'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`text-3xl leading-none ${achievement.unlocked ? '' : 'grayscale opacity-[.35]'}`}
          aria-hidden="true"
        >
          {achievement.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-head text-[16px] text-ink">{achievement.title}</h3>
            <Badge tone={achievement.unlocked ? 'ok' : 'dim'}>
              {achievement.unlocked ? 'Terbuka' : 'Terkunci'}
            </Badge>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-dim">{achievement.description}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[.06em] text-dimmer">
        <span>{Math.min(achievement.value, achievement.goal)} / {achievement.goal}</span>
        <span>{achievement.progress}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel2" aria-hidden="true">
        <div className="h-full rounded-full bg-accent" style={{ width: `${achievement.progress}%` }} />
      </div>
    </article>
  );
}
