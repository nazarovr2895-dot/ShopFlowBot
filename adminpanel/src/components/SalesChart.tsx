export interface SalesChartPoint {
  date: string;
  revenue: number;
  orders?: number;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
const CURRENCY_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatAxisCurrency(value: number): string {
  if (value >= 1000) {
    const thousands = Math.round(value / 1000);
    return thousands >= 1000
      ? `${CURRENCY_FORMATTER.format(value)} ₽`
      : `${CURRENCY_FORMATTER.format(thousands)} тыс. ₽`;
  }
  return `${CURRENCY_FORMATTER.format(value)} ₽`;
}

function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function SalesChart({ data }: { data: SalesChartPoint[] }) {
  if (!data.length) {
    return <div className="seller-chart-empty">Нет данных за выбранный период</div>;
  }

  const width = 600;
  const height = 240;
  const paddingLeft = 72;
  const paddingRight = 24;
  const paddingTop = 28;
  const paddingBottom = 48;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxRevenue = Math.max(...data.map((point) => point.revenue), 1);

  const scaleX = (index: number): number => {
    if (data.length === 1) {
      return paddingLeft + chartWidth / 2;
    }
    return paddingLeft + (index / (data.length - 1)) * chartWidth;
  };

  const scaleY = (value: number): number => {
    if (!maxRevenue) {
      return paddingTop + chartHeight;
    }
    const ratio = value / maxRevenue;
    return paddingTop + (1 - ratio) * chartHeight;
  };

  let linePath = '';
  data.forEach((point, index) => {
    const x = scaleX(index);
    const y = scaleY(point.revenue);
    linePath += index === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  const chartBottom = paddingTop + chartHeight;
  const areaPath = `${linePath} L ${scaleX(data.length - 1)} ${chartBottom} L ${scaleX(0)} ${chartBottom} Z`;

  const yTicks = [maxRevenue, maxRevenue / 2, 0]
    .map((value) => (Number.isFinite(value) ? value : 0))
    .filter((value, index, self) => self.findIndex((x) => Math.abs(x - value) < 1e-6) === index);

  const tickTarget = Math.min(6, data.length);
  const step = tickTarget > 0 ? Math.max(1, Math.round(data.length / tickTarget)) : 1;
  const xTicks: { x: number; label: string }[] = [];
  for (let i = 0; i < data.length; i += step) {
    const point = data[i];
    xTicks.push({
      x: scaleX(i),
      label: DATE_FORMATTER.format(parseISODate(point.date)),
    });
  }
  const lastPoint = data[data.length - 1];
  const lastLabel = DATE_FORMATTER.format(parseISODate(lastPoint.date));
  if (!xTicks.some((tick) => tick.label === lastLabel)) {
    xTicks.push({
      x: scaleX(data.length - 1),
      label: lastLabel,
    });
  }

  return (
    <div className="seller-chart-wrap">
      <svg className="seller-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="sellerChartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(123, 142, 255, 0.5)" />
            <stop offset="100%" stopColor="rgba(123, 142, 255, 0.05)" />
          </linearGradient>
        </defs>
        <g>
          {yTicks.map((value) => {
            const y = scaleY(value);
            return (
              <g key={`y-${value}`}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={paddingLeft + chartWidth}
                  y2={y}
                  className="seller-chart-grid"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  className="seller-chart-axis-label seller-chart-axis-label--y"
                  dominantBaseline="middle"
                >
                  {formatAxisCurrency(Math.max(value, 0))}
                </text>
              </g>
            );
          })}
        </g>
        <path d={areaPath} fill="url(#sellerChartGradient)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--chart-line, #7b8eff)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((point, index) => {
          const x = scaleX(index);
          const y = scaleY(point.revenue);
          return (
            <circle
              key={`${point.date}-${index}`}
              cx={x}
              cy={y}
              r={3.5}
              fill="var(--bg)"
              stroke="var(--chart-line, #7b8eff)"
              strokeWidth={2}
            />
          );
        })}
        <line
          x1={paddingLeft}
          y1={chartBottom}
          x2={paddingLeft + chartWidth}
          y2={chartBottom}
          className="seller-chart-axis"
        />
        {xTicks.map((tick, idx) => (
          <text
            key={`x-${idx}-${tick.label}`}
            x={tick.x}
            y={height - 14}
            className="seller-chart-axis-label seller-chart-axis-label--x"
            dominantBaseline="hanging"
          >
            {tick.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
