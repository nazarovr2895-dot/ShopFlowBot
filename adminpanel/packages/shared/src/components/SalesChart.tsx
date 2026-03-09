import { useState } from 'react';
import { buildSmoothPath, computeNiceTicks, type ChartPoint } from '../utils/chartUtils';

export interface SalesChartPoint {
  date: string;
  revenue: number;
  orders?: number;
  profit?: number;
}

interface SalesChartProps {
  data: SalesChartPoint[];
  showLegend?: boolean;
}

/* ── Formatting ────────────────────────────────────────── */

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

function pluralize(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/* ── Line config ───────────────────────────────────────── */

interface LineConfig {
  key: 'revenue' | 'profit';
  getValue: (p: SalesChartPoint) => number;
  color: string;
  label: string;
}

const REVENUE_LINE: LineConfig = {
  key: 'revenue',
  getValue: (p) => p.revenue,
  color: 'var(--chart-line, #7b8eff)',
  label: 'Выручка',
};

const PROFIT_LINE: LineConfig = {
  key: 'profit',
  getValue: (p) => p.profit ?? 0,
  color: 'var(--success, #22c55e)',
  label: 'Доход',
};

/* ── Component ─────────────────────────────────────────── */

export function SalesChart({ data, showLegend }: SalesChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>({
    revenue: true,
    profit: true,
  });

  if (!data.length) {
    return <div className="seller-chart-empty">Нет данных за выбранный период</div>;
  }

  /* ── Derived state ── */
  const hasProfitData = data.some((p) => p.profit != null);
  const lines: LineConfig[] = [REVENUE_LINE];
  if (hasProfitData) lines.push(PROFIT_LINE);

  const legendVisible = hasProfitData && showLegend !== false;

  const toggleLine = (key: string) => {
    setVisibleLines((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyVisible = lines.some((l) => next[l.key]);
      if (!anyVisible) return prev;
      return next;
    });
  };

  /* ── Layout constants ── */
  const width = 600;
  const height = 240;
  const paddingLeft = 72;
  const paddingRight = 24;
  const paddingTop = 28;
  const paddingBottom = 48;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const chartBottom = paddingTop + chartHeight;

  /* ── Scales ── */
  let dataMax = 0;
  for (const line of lines) {
    if (!visibleLines[line.key]) continue;
    for (const p of data) {
      const v = line.getValue(p);
      if (v > dataMax) dataMax = v;
    }
  }
  dataMax = Math.max(dataMax, 1);

  const yTicks = computeNiceTicks(dataMax);
  const yMax = yTicks[yTicks.length - 1] || dataMax;

  const scaleX = (index: number): number => {
    if (data.length === 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (data.length - 1)) * chartWidth;
  };

  const scaleY = (value: number): number => {
    if (!yMax) return chartBottom;
    return paddingTop + (1 - value / yMax) * chartHeight;
  };

  /* ── X-axis ticks ── */
  const tickTarget = Math.min(6, data.length);
  const step = tickTarget > 0 ? Math.max(1, Math.round(data.length / tickTarget)) : 1;
  const xTicks: { x: number; label: string }[] = [];
  for (let i = 0; i < data.length; i += step) {
    xTicks.push({
      x: scaleX(i),
      label: DATE_FORMATTER.format(parseISODate(data[i].date)),
    });
  }
  const lastLabel = DATE_FORMATTER.format(parseISODate(data[data.length - 1].date));
  if (!xTicks.some((t) => t.label === lastLabel)) {
    xTicks.push({ x: scaleX(data.length - 1), label: lastLabel });
  }

  /* ── Build smooth paths for visible lines ── */
  const renderedLines = lines
    .filter((l) => visibleLines[l.key])
    .map((l) => {
      const points: ChartPoint[] = data.map((_, i) => ({
        x: scaleX(i),
        y: scaleY(l.getValue(data[i])),
      }));
      return { ...l, linePath: buildSmoothPath(points) };
    });

  /* ── Tooltip positioning ── */
  const hoveredPoint = hovered !== null ? data[hovered] : null;
  const hoveredX = hovered !== null ? scaleX(hovered) : 0;
  const tooltipW = 150;
  const tooltipH = 52 + (hasProfitData && visibleLines.profit ? 20 : 0);

  let tooltipX = hoveredX - tooltipW / 2;
  if (tooltipX < paddingLeft) tooltipX = paddingLeft;
  if (tooltipX + tooltipW > width - paddingRight) tooltipX = width - paddingRight - tooltipW;

  const hoveredYs = hovered !== null
    ? renderedLines.map((rl) => scaleY(rl.getValue(data[hovered])))
    : [];
  const minHoveredY = hoveredYs.length ? Math.min(...hoveredYs) : 0;
  const tooltipY = minHoveredY - tooltipH - 14 > paddingTop
    ? minHoveredY - tooltipH - 14
    : (hoveredYs.length ? Math.max(...hoveredYs) : 0) + 16;

  return (
    <div className="seller-chart-wrap">
      {/* ── Legend ── */}
      {legendVisible && (
        <div className="chart-legend">
          {lines.map((line) => (
            <button
              key={line.key}
              type="button"
              className={`chart-legend-item ${!visibleLines[line.key] ? 'chart-legend-item--hidden' : ''}`}
              onClick={() => toggleLine(line.key)}
            >
              <span
                className="chart-legend-swatch"
                style={{ backgroundColor: visibleLines[line.key] ? line.color : 'var(--text-muted)' }}
              />
              <span className="chart-legend-label">{line.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── SVG Chart ── */}
      <svg className="seller-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* ── Y-axis grid + labels ── */}
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

        {/* ── Line strokes (smooth curves) ── */}
        {renderedLines.map((rl) => (
          <path
            key={`line-${rl.key}`}
            d={rl.linePath}
            fill="none"
            stroke={rl.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* ── Hover-only data point dots ── */}
        {hovered !== null &&
          renderedLines.map((rl) => {
            const x = scaleX(hovered);
            const y = scaleY(rl.getValue(data[hovered]));
            return (
              <circle
                key={`dot-${rl.key}`}
                cx={x}
                cy={y}
                r={5}
                fill={rl.color}
                stroke="var(--bg-elevated, var(--bg))"
                strokeWidth={2.5}
                pointerEvents="none"
              />
            );
          })}

        {/* ── Hit areas for hover ── */}
        {data.map((_point, index) => {
          const x = scaleX(index);
          const segW = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;
          return (
            <rect
              key={`hit-${index}`}
              x={x - segW / 2}
              y={paddingTop}
              width={segW}
              height={chartHeight}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        {/* ── Hover guide line ── */}
        {hovered !== null && (
          <line
            x1={hoveredX}
            y1={paddingTop}
            x2={hoveredX}
            y2={chartBottom}
            stroke="var(--text-muted, #999)"
            strokeDasharray="3 3"
            opacity={0.5}
            pointerEvents="none"
          />
        )}

        {/* ── X-axis labels ── */}
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

        {/* ── Tooltip ── */}
        {hovered !== null && hoveredPoint && (
          <foreignObject
            x={tooltipX}
            y={tooltipY}
            width={tooltipW}
            height={tooltipH + 4}
            pointerEvents="none"
          >
            <div className="chart-tooltip">
              <div className="chart-tooltip-date">
                {DATE_FORMATTER.format(parseISODate(hoveredPoint.date))}
              </div>
              {visibleLines.revenue && (
                <div className="chart-tooltip-row">
                  <span className="chart-tooltip-dot" style={{ background: 'var(--chart-line, #7b8eff)' }} />
                  <span className="chart-tooltip-label">Выручка:</span>
                  <span className="chart-tooltip-val">{CURRENCY_FORMATTER.format(hoveredPoint.revenue)} ₽</span>
                </div>
              )}
              {hasProfitData && visibleLines.profit && hoveredPoint.profit != null && (
                <div className="chart-tooltip-row">
                  <span className="chart-tooltip-dot" style={{ background: 'var(--success, #22c55e)' }} />
                  <span className="chart-tooltip-label">Доход:</span>
                  <span className="chart-tooltip-val">{CURRENCY_FORMATTER.format(hoveredPoint.profit)} ₽</span>
                </div>
              )}
              {hoveredPoint.orders != null && (
                <div className="chart-tooltip-orders">
                  {hoveredPoint.orders} {pluralize(hoveredPoint.orders, 'заказ', 'заказа', 'заказов')}
                </div>
              )}
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
}
