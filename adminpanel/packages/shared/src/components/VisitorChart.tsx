/**
 * SVG line chart for daily visitor analytics.
 * Shared between Admin Panel and Seller Panel.
 */

import { useState } from 'react';
import { buildSmoothPath, computeNiceTicks, type ChartPoint } from '../utils/chartUtils';

export interface VisitorDailyPoint {
  date: string;
  unique_visitors: number;
  shop_views: number;
  product_views: number;
  orders_placed: number;
  conversion_rate: number;
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });

function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function VisitorChart({ daily }: { daily: VisitorDailyPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (daily.length === 0) return null;

  const W = 700, H = 200, PL = 50, PR = 20, PT = 20, PB = 40;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const plotBottom = PT + plotH;

  const maxVal = Math.max(...daily.map((d) => d.unique_visitors), 1);
  const yTicks = computeNiceTicks(maxVal);
  const yMax = yTicks[yTicks.length - 1] || maxVal;

  const scaleX = (i: number): number => {
    if (daily.length === 1) return PL + plotW / 2;
    return PL + (i / (daily.length - 1)) * plotW;
  };

  const scaleY = (v: number): number => {
    if (!yMax) return plotBottom;
    return PT + (1 - v / yMax) * plotH;
  };

  const points: ChartPoint[] = daily.map((_, i) => ({
    x: scaleX(i),
    y: scaleY(daily[i].unique_visitors),
  }));

  const line = buildSmoothPath(points);

  /* ── X-axis ticks ── */
  const tickTarget = Math.min(7, daily.length);
  const step = tickTarget > 0 ? Math.max(1, Math.round(daily.length / tickTarget)) : 1;
  const xTicks: { x: number; label: string }[] = [];
  for (let i = 0; i < daily.length; i += step) {
    xTicks.push({ x: scaleX(i), label: DATE_FMT.format(parseISODate(daily[i].date)) });
  }
  const lastLabel = DATE_FMT.format(parseISODate(daily[daily.length - 1].date));
  if (!xTicks.some((t) => t.label === lastLabel)) {
    xTicks.push({ x: scaleX(daily.length - 1), label: lastLabel });
  }

  /* ── Tooltip ── */
  const hoveredPoint = hovered !== null ? daily[hovered] : null;
  const hoveredX = hovered !== null ? scaleX(hovered) : 0;
  const hoveredY = hoveredPoint ? scaleY(hoveredPoint.unique_visitors) : 0;
  const tooltipW = 160;
  const tooltipH = 62;
  let tooltipX = hoveredX - tooltipW / 2;
  if (tooltipX < PL) tooltipX = PL;
  if (tooltipX + tooltipW > W - PR) tooltipX = W - PR - tooltipW;
  const tooltipY = hoveredY - tooltipH - 14 > PT ? hoveredY - tooltipH - 14 : hoveredY + 16;

  return (
    <div className="seller-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="seller-chart-svg">
        {/* Grid + Y labels */}
        {yTicks.map((value) => {
          const y = scaleY(value);
          return (
            <g key={`y-${value}`}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} className="seller-chart-grid" />
              <text x={PL - 6} y={y + 4} className="seller-chart-axis-label seller-chart-axis-label--y" dominantBaseline="middle">
                {value}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {xTicks.map((tick, idx) => (
          <text key={`x-${idx}`} x={tick.x} y={H - 8} className="seller-chart-axis-label seller-chart-axis-label--x" dominantBaseline="hanging">
            {tick.label}
          </text>
        ))}

        {/* Smooth line */}
        <path d={line} fill="none" stroke="var(--accent, #6c5ce7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover-only dot */}
        {hovered !== null && (
          <circle
            cx={scaleX(hovered)}
            cy={scaleY(daily[hovered].unique_visitors)}
            r={5}
            fill="var(--accent, #6c5ce7)"
            stroke="var(--bg-elevated, var(--bg))"
            strokeWidth={2.5}
            pointerEvents="none"
          />
        )}

        {/* Hit areas */}
        {daily.map((_, i) => {
          const x = scaleX(i);
          const segW = daily.length > 1 ? plotW / (daily.length - 1) : plotW;
          return (
            <rect
              key={`hit-${i}`}
              x={x - segW / 2}
              y={PT}
              width={segW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        {/* Hover guide line */}
        {hovered !== null && (
          <line
            x1={hoveredX}
            y1={PT}
            x2={hoveredX}
            y2={plotBottom}
            stroke="var(--text-muted, #999)"
            strokeDasharray="3 3"
            opacity={0.5}
            pointerEvents="none"
          />
        )}

        {/* Tooltip */}
        {hovered !== null && hoveredPoint && (
          <foreignObject x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH + 4} pointerEvents="none">
            <div className="chart-tooltip">
              <div className="chart-tooltip-date">
                {DATE_FMT.format(parseISODate(hoveredPoint.date))}
              </div>
              <div className="chart-tooltip-row">
                <span className="chart-tooltip-dot" style={{ background: 'var(--accent, #6c5ce7)' }} />
                <span className="chart-tooltip-label">Посетителей:</span>
                <span className="chart-tooltip-val">{hoveredPoint.unique_visitors}</span>
              </div>
              <div className="chart-tooltip-orders">
                Конверсия: {hoveredPoint.conversion_rate}%
              </div>
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
}
