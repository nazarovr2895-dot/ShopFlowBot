export interface SparklinePoint {
  date: string;
  revenue: number;
}

interface MiniSparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
}

export function MiniSparkline({ data, width = 200, height = 48 }: MiniSparklineProps) {
  if (data.length < 2) return null;

  const pad = 2;
  const maxRevenue = Math.max(...data.map((p) => p.revenue), 1);
  const minRevenue = Math.min(...data.map((p) => p.revenue), 0);
  const range = maxRevenue - minRevenue || 1;

  const points = data.map((p, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (p.revenue - minRevenue) / range) * (height - pad * 2);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="mini-sparkline"
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(123, 142, 255, 0.4)" />
          <stop offset="100%" stopColor="rgba(123, 142, 255, 0.02)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkGrad)" />
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent, #7b8eff)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
