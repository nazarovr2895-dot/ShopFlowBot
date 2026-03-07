/**
 * SVG line chart for daily visitor analytics.
 * Shared between Admin Panel and Seller Panel.
 */

export interface VisitorDailyPoint {
  date: string;
  unique_visitors: number;
  shop_views: number;
  product_views: number;
  orders_placed: number;
  conversion_rate: number;
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });

export function VisitorChart({ daily }: { daily: VisitorDailyPoint[] }) {
  if (daily.length === 0) return null;

  const W = 700, H = 200, PX = 50, PY = 20;
  const plotW = W - PX * 2;
  const plotH = H - PY * 2;

  const maxVal = Math.max(...daily.map((d) => d.unique_visitors), 1);
  const yTicks = 4;

  const points = daily.map((d, i) => {
    const x = PX + (daily.length > 1 ? (i / (daily.length - 1)) * plotW : plotW / 2);
    const y = PY + plotH - (d.unique_visitors / maxVal) * plotH;
    return { x, y, ...d };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <div className="seller-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="seller-chart-svg">
        {/* Grid */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = PY + (i / yTicks) * plotH;
          const val = Math.round(maxVal - (i / yTicks) * maxVal);
          return (
            <g key={i}>
              <line x1={PX} y1={y} x2={W - PX} y2={y} className="seller-chart-grid" />
              <text x={PX - 6} y={y + 4} className="seller-chart-axis-label seller-chart-axis-label--y">{val}</text>
            </g>
          );
        })}

        {/* X labels */}
        {points.map((p, i) => {
          if (daily.length > 14 && i % Math.ceil(daily.length / 7) !== 0) return null;
          const d = new Date(p.date + 'T00:00:00');
          return (
            <text key={i} x={p.x} y={H - 2} className="seller-chart-axis-label seller-chart-axis-label--x">
              {DATE_FMT.format(d)}
            </text>
          );
        })}

        {/* Line */}
        <path d={line} fill="none" stroke="var(--accent, #6c5ce7)" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="var(--accent, #6c5ce7)" />
        ))}
      </svg>
    </div>
  );
}
