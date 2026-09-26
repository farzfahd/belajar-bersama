const EMPTY_CLASS = 'border border-line bg-bg2';
const PHASE_CLASSES = {
  started: [
    EMPTY_CLASS,
    'border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]',
    'border border-[color-mix(in_srgb,var(--accent)_48%,transparent)] bg-[color-mix(in_srgb,var(--accent)_38%,transparent)]',
    'border border-[color-mix(in_srgb,var(--accent)_75%,transparent)] bg-[color-mix(in_srgb,var(--accent)_68%,transparent)]'
  ],
  learning: [
    EMPTY_CLASS,
    'border border-[color-mix(in_srgb,var(--warn)_28%,transparent)] bg-[color-mix(in_srgb,var(--warn)_18%,transparent)]',
    'border border-[color-mix(in_srgb,var(--warn)_48%,transparent)] bg-[color-mix(in_srgb,var(--warn)_38%,transparent)]',
    'border border-[color-mix(in_srgb,var(--warn)_75%,transparent)] bg-[color-mix(in_srgb,var(--warn)_68%,transparent)]'
  ],
  completed: [
    EMPTY_CLASS,
    'border border-[color-mix(in_srgb,var(--ok)_28%,transparent)] bg-[color-mix(in_srgb,var(--ok)_18%,transparent)]',
    'border border-[color-mix(in_srgb,var(--ok)_48%,transparent)] bg-[color-mix(in_srgb,var(--ok)_38%,transparent)]',
    'border border-[color-mix(in_srgb,var(--ok)_75%,transparent)] bg-[color-mix(in_srgb,var(--ok)_68%,transparent)]'
  ],
  empty: [EMPTY_CLASS, EMPTY_CLASS, EMPTY_CLASS, EMPTY_CLASS]
};

function HeatmapCell({ day }) {
  const levels = PHASE_CLASSES[day.phase] || PHASE_CLASSES.empty;
  return (
    <span
      className={`block h-3 w-3 rounded-smc ${levels[day.level]}`}
      title={day.label}
      aria-label={day.label}
      role="img"
    />
  );
}

export default function ActivityHeatmap({ weeks = [], compact = false }) {
  if (!weeks.length) return null;
  return (
    <div className="space-y-3" aria-label="Heatmap kontribusi mingguan">
      <div className="overflow-x-auto pb-1">
        <div
          className="flex min-w-[420px] gap-1"
          style={{ minWidth: compact ? 420 : 560 }}
        >
          {weeks.map((week) => (
            <div key={week.start} className="grid min-w-[12px] flex-1 grid-rows-7 gap-1">
              {week.days.map((day) => <HeatmapCell key={day.key} day={day} />)}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[.06em] text-dimmer">
        <span>{weeks.length} minggu terakhir · zona waktu Asia/Jakarta</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded-smc ${PHASE_CLASSES.started[3]}`} aria-hidden="true" />
            Mulai
          </span>
          <span className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded-smc ${PHASE_CLASSES.learning[3]}`} aria-hidden="true" />
            Belajar
          </span>
          <span className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded-smc ${PHASE_CLASSES.completed[3]}`} aria-hidden="true" />
            Selesai
          </span>
        </span>
      </div>
    </div>
  );
}
