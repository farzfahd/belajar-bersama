const WIDTH = 640;
const HEIGHT = 220;
const LEFT = 38;
const RIGHT = 14;
const TOP = 18;
const BOTTOM = 32;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;

const BAR_COLORS = {
  not_started: 'var(--border-strong)',
  learning: 'var(--warn)',
  completed: 'var(--ok)'
};

function pointsFor(data) {
  if (!data.length) return [];
  return data.map((item, index) => {
    const x = LEFT + (data.length === 1 ? PLOT_WIDTH / 2 : (index / (data.length - 1)) * PLOT_WIDTH);
    const y = TOP + PLOT_HEIGHT - (Math.max(0, Math.min(100, Number(item.value) || 0)) / 100) * PLOT_HEIGHT;
    return { ...item, x, y };
  });
}

function LineChart({ data }) {
  const points = pointsFor(data);
  return (
    <div className="chart-wrap" role="img" aria-label="Grafik garis skor materi">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="presentation">
        <title>Skor materi per minggu</title>
        {[0, 50, 100].map((tick) => {
          const y = TOP + PLOT_HEIGHT - (tick / 100) * PLOT_HEIGHT;
          return (
            <g key={tick}>
              <line x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={LEFT - 8} y={y + 4} textAnchor="end" fill="var(--text-dimmer)" fontSize="10" fontFamily="var(--font-mono)">
                {tick}
              </text>
            </g>
          );
        })}
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point) => (
          <circle key={point.key} cx={point.x} cy={point.y} r="4" fill="var(--bg)" stroke="var(--accent)" strokeWidth="2">
            <title>{`${point.label}: ${point.value}%`}</title>
          </circle>
        ))}
        {points.map((point) => (
          <text key={`${point.key}-label`} x={point.x} y={HEIGHT - 10} textAnchor="middle" fill="var(--text-dimmer)" fontSize="10" fontFamily="var(--font-mono)">
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function BarChart({ data }) {
  const max = Math.max(1, ...data.map((item) => Number(item.count) || 0));
  const slot = PLOT_WIDTH / Math.max(1, data.length);
  const barWidth = Math.min(54, slot * 0.55);
  return (
    <div className="chart-wrap" role="img" aria-label="Grafik batang fase materi">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="presentation">
        <title>Distribusi fase materi</title>
        {[0, 0.5, 1].map((ratio) => {
          const y = TOP + PLOT_HEIGHT - ratio * PLOT_HEIGHT;
          return (
            <g key={ratio}>
              <line x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={LEFT - 8} y={y + 4} textAnchor="end" fill="var(--text-dimmer)" fontSize="10" fontFamily="var(--font-mono)">
                {Math.round(max * ratio)}
              </text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const height = ((Number(item.count) || 0) / max) * PLOT_HEIGHT;
          const x = LEFT + slot * index + (slot - barWidth) / 2;
          const y = TOP + PLOT_HEIGHT - height;
          return (
            <g key={item.key}>
              <rect x={x} y={y} width={barWidth} height={height} rx="4" fill={BAR_COLORS[item.key] || 'var(--border-strong)'}>
                <title>{`${item.label}: ${item.count}`}</title>
              </rect>
              <text x={x + barWidth / 2} y={HEIGHT - 10} textAnchor="middle" fill="var(--text-dimmer)" fontSize="10" fontFamily="var(--font-mono)">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ProgressChart({ lineData = [], barData = [] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">line · 8 minggu</div>
            <h3 className="font-head text-lg text-ink">Skor materi</h3>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">snapshot</span>
        </div>
        <LineChart data={lineData} />
        <p className="mt-2 text-[12px] leading-relaxed text-dimmer">
          Proporsi materi yang selesai berdasarkan data tersimpan; skor quiz belum tersedia.
        </p>
      </section>
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">bar · fase materi</div>
            <h3 className="font-head text-lg text-ink">Distribusi materi</h3>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">saat ini</span>
        </div>
        <BarChart data={barData} />
        <p className="mt-2 text-[12px] leading-relaxed text-dimmer">
          Topik, catatan, dan resource digabung berdasarkan status Belajar Together.
        </p>
      </section>
    </div>
  );
}
