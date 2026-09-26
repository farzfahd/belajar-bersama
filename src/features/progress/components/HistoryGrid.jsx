const LEVEL_CLASSES = [
  'border border-line bg-bg2',
  'border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]',
  'border border-[color-mix(in_srgb,var(--accent)_48%,transparent)] bg-[color-mix(in_srgb,var(--accent)_38%,transparent)]',
  'border border-[color-mix(in_srgb,var(--accent)_75%,transparent)] bg-[color-mix(in_srgb,var(--accent)_68%,transparent)]'
];

export default function HistoryGrid({ grid }) {
  if (!grid?.days?.length) return null;
  return (
    <div className="space-y-3" aria-label="Heatmap kontribusi mingguan per jam">
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[620px]">
          <div className="mb-1 grid grid-cols-[28px_repeat(24,minmax(0,1fr))] gap-1 font-mono text-[8px] text-dimmer">
            <span />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="text-center">{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</span>
            ))}
          </div>
          <div className="space-y-1">
            {grid.days.map((day) => (
              <div key={day.key} className="grid grid-cols-[28px_repeat(24,minmax(0,1fr))] items-center gap-1">
                <span className="font-mono text-[9px] uppercase text-dimmer">{day.label}</span>
                {day.hours.map((hour) => (
                  <span
                    key={hour.hour}
                    className={`h-4 min-w-0 rounded-smc ${LEVEL_CLASSES[hour.level]}`}
                    title={hour.label}
                    aria-label={hour.label}
                    role="img"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="font-mono text-[9px] uppercase tracking-[.06em] text-dimmer">
        7 hari × 24 jam · zona waktu Asia/Jakarta
      </p>
    </div>
  );
}
