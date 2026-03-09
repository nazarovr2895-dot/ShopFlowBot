export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Build a smooth SVG path string from points using Catmull-Rom → cubic bezier conversion.
 */
export function buildSmoothPath(points: ChartPoint[], tension = 1): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${points[0].x} ${points[0].y}`;
  if (n === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const t = 6 * tension;
  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < n ? i + 2 : n - 1];

    const cp1x = p1.x + (p2.x - p0.x) / t;
    const cp1y = p1.y + (p2.y - p0.y) / t;
    const cp2x = p2.x - (p3.x - p1.x) / t;
    const cp2y = p2.y - (p3.y - p1.y) / t;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

/**
 * Compute nice Y-axis tick values for a given max data value.
 */
export function computeNiceTicks(maxVal: number, targetCount = 5): number[] {
  if (maxVal <= 0) return [0];
  const roughStep = maxVal / (targetCount - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / mag;

  let niceStep: number;
  if (normalized <= 1.5) niceStep = 1 * mag;
  else if (normalized <= 3) niceStep = 2 * mag;
  else if (normalized <= 7) niceStep = 5 * mag;
  else niceStep = 10 * mag;

  const niceMax = Math.ceil(maxVal / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + niceStep * 0.001; v += niceStep) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}
