"use client";

import { useEffect, useRef, useState } from "react";
import { shortDate } from "@/lib/analytics/format";
import type { DailyPoint } from "@/lib/analytics/types";
import { CHART, OUTCOME_SERIES } from "./chart-theme";

const H = 224;
const M = { top: 22, right: 8, bottom: 26, left: 34 };
const WEEKDAY = "日一二三四五六";
const TIP_W = 164;

function niceStep(max: number): number {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500]) if (max / s <= 4) return s;
  return 1000;
}

const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00+08:00`);
  return `${shortDate(d.toISOString())}（週${WEEKDAY[d.getUTCDay()]}）`;
};

/**
 * Questions per day, stacked by outcome. Drawn in pixels against the measured
 * width (not a scaled viewBox), so text stays 11px however wide the panel is.
 * Hover a column — or focus the chart and use ←/→ — for that day's numbers.
 */
export function DailyChart({ points }: { points: DailyPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totals = points.map((p) => p.answered + p.noMatch + p.errors);
  const max = Math.max(0, ...totals);
  const step = niceStep(Math.max(1, max));
  const top = Math.max(step, Math.ceil(Math.max(1, max) / step) * step);
  const pw = Math.max(0, width - M.left - M.right);
  const ph = H - M.top - M.bottom;
  const band = points.length ? pw / points.length : 0;
  const bw = Math.max(2, Math.min(22, band * 0.64));
  const y = (v: number) => M.top + ph - (v / top) * ph;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const errorDays = points.map((p, i) => (p.errors > 0 ? i : -1)).filter((i) => i >= 0).slice(-2);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((a) => {
      const cur = a ?? points.length - 1;
      return Math.min(points.length - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
    });
  };

  const tip = active !== null ? points[active] : null;
  // Beside the column, never over it — the bar being read stays in view.
  // Right of it by default; left when that would run off the panel.
  const colX = active !== null ? M.left + band * active + band / 2 : 0;
  const right = colX + bw / 2 + 10;
  const tipLeft = right + TIP_W <= width ? right : Math.max(0, colX - bw / 2 - 10 - TIP_W);

  return (
    <div
      ref={wrap}
      className="relative outline-none focus-visible:ring-2 focus-visible:ring-engenius-blue/30 rounded-md"
      tabIndex={0}
      role="img"
      aria-label={`每日提問數，共 ${points.length} 天，依已回答、答不出來、錯誤分段。聚焦後可用左右鍵逐日查看。`}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      onMouseLeave={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={H} className="block select-none">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.baseline : CHART.grid} />
              <text x={M.left - 8} y={y(t) + 4} textAnchor="end" style={{ fill: CHART.tick, fontSize: 11 }} className="tabular-nums">
                {t}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x0 = M.left + band * i + (band - bw) / 2;
            const parts = [p.answered, p.noMatch, p.errors];
            const topIdx = parts.map((v) => v > 0).lastIndexOf(true);
            let acc = 0;
            return (
              <g key={p.day} onMouseEnter={() => setActive(i)} opacity={active === null || active === i ? 1 : 0.45} style={{ transition: "opacity 120ms ease-out" }}>
                <rect x={M.left + band * i} y={M.top} width={band} height={ph} fill="transparent" />
                {parts.map((v, k) => {
                  if (!v) return null;
                  const yTop = y(acc + v);
                  const yBottom = y(acc) - (acc > 0 ? 2 : 0);
                  acc += v;
                  const h = Math.max(1, yBottom - yTop);
                  const r = k === topIdx ? Math.min(3, h, bw / 2) : 0;
                  const d = `M${x0},${yTop + h} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + bw - r} Q${x0 + bw},${yTop} ${x0 + bw},${yTop + r} V${yTop + h} Z`;
                  return <path key={k} d={d} fill={OUTCOME_SERIES[k].color} />;
                })}
              </g>
            );
          })}
          {errorDays.map((i) => (
            <text
              key={`e${i}`}
              x={Math.min(width - M.right - 18, Math.max(M.left + 18, M.left + band * i + band / 2))}
              y={y(totals[i]) - 7}
              textAnchor="middle"
              style={{ fill: "#b91c1c", fontSize: 11, fontWeight: 500 }}
            >
              錯誤 {points[i].errors}
            </text>
          ))}
          {points.map((p, i) =>
            (points.length - 1 - i) % labelEvery === 0 ? (
              <text key={`x${p.day}`} x={M.left + band * i + band / 2} y={H - 8} textAnchor="middle" style={{ fill: CHART.tick, fontSize: 11 }} className="tabular-nums">
                {shortDate(new Date(`${p.day}T12:00:00+08:00`).toISOString())}
              </text>
            ) : null,
          )}
          {max === 0 && (
            <text x={M.left + pw / 2} y={M.top + ph / 2} textAnchor="middle" style={{ fill: CHART.tick, fontSize: 12.5 }}>
              這段期間沒有提問
            </text>
          )}
        </svg>
      )}
      {tip && active !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border bg-background px-3 py-2 text-[12px] shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
          style={{ left: tipLeft, top: M.top, width: TIP_W }}
        >
          <div className="text-muted-foreground">{dayLabel(tip.day)}</div>
          <div className="mb-1 mt-0.5 text-[13px] font-semibold tabular-nums text-foreground">共 {totals[active]} 題</div>
          {OUTCOME_SERIES.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4 leading-6">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-0.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-medium tabular-nums text-foreground">{tip[s.key]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
      {OUTCOME_SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** The same numbers as a table — for reading exact values, and for screen readers. */
export function DailyTable({ points }: { points: DailyPoint[] }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-muted/60 text-[12px] text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">日期</th>
            {OUTCOME_SERIES.map((s) => (
              <th key={s.key} className="px-4 py-2 text-right font-medium">{s.label}</th>
            ))}
            <th className="px-4 py-2 text-right font-medium">合計</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {[...points].reverse().map((p) => (
            <tr key={p.day} className="border-t">
              <td className="px-4 py-1.5 text-muted-foreground">{dayLabel(p.day)}</td>
              <td className="px-4 py-1.5 text-right">{p.answered}</td>
              <td className="px-4 py-1.5 text-right">{p.noMatch}</td>
              <td className="px-4 py-1.5 text-right">{p.errors}</td>
              <td className="px-4 py-1.5 text-right font-medium">{p.answered + p.noMatch + p.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
