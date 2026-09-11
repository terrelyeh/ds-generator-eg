import { CHART } from "./chart-theme";

/**
 * A trend in the space of a word. Past a month of points it sums by week, so
 * a 90-day line stays readable at 88px. A window with nothing in it draws a
 * flat hairline rather than an empty box.
 */
export function Sparkline({
  values,
  width = 88,
  height = 24,
  color = CHART.answered,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}) {
  let points = values;
  if (points.length > 31) {
    const weeks: number[] = [];
    for (let i = points.length % 7; i < points.length; i += 7) weeks.push(points.slice(i, i + 7).reduce((s, v) => s + v, 0));
    points = weeks;
  }
  const max = Math.max(0, ...points);
  const pad = 3;
  const base = height - 2;
  if (max === 0 || points.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden={!label} role={label ? "img" : undefined}>
        {label && <title>{label}</title>}
        <line x1={pad} x2={width - pad} y1={base} y2={base} stroke={CHART.idle} strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  }
  const x = (i: number) => pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = (v: number) => base - (v / max) * (height - 7);
  const line = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
  const last = points.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden={!label} role={label ? "img" : undefined}>
      {label && <title>{label}</title>}
      <path d={`M${line} L${x(last).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`} fill={color} fillOpacity={0.1} />
      <path d={`M${line}`} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(points[last])} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
