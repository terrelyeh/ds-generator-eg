import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

export interface Kpi {
  label: string;
  value: string;
  /** Small trailing text on the value, e.g. "/ 6". */
  unit?: string;
  /** Change against the previous window; tone says whether that direction is good. */
  delta?: { text: string; tone: "good" | "bad" | "neutral" } | null;
  note?: string;
  trend?: number[];
  trendColor?: string;
  /** A small visual of its own in place of the trend line. */
  extra?: React.ReactNode;
}

const DELTA_TONE = { good: "text-emerald-700", bad: "text-red-700", neutral: "text-muted-foreground" } as const;

/**
 * The period at a glance, as one object: cells separated by hairlines rather
 * than floated as separate cards. The 1px gaps show the border colour through,
 * so dividers stay right however the grid wraps.
 */
export function KpiStrip({ items, dimmed }: { items: Kpi[]; dimmed?: boolean }) {
  const cols = items.length === 6 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : "grid-cols-2 lg:grid-cols-4";
  return (
    <div className={cn("grid gap-px overflow-hidden rounded-xl border bg-border transition-opacity duration-200", cols, dimmed && "opacity-60")}>
      {items.map((k) => (
        <div key={k.label} className="flex min-w-0 flex-col bg-background px-5 pb-4 pt-3.5">
          <span className="truncate text-[13px] text-muted-foreground">{k.label}</span>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="whitespace-nowrap text-[28px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                {k.value}
                {k.unit && <span className="ml-1 text-[14px] font-medium tracking-normal text-muted-foreground">{k.unit}</span>}
              </div>
              <div className="mt-2 truncate text-[12px]">
                {k.delta ? (
                  <span className={DELTA_TONE[k.delta.tone]}>{k.delta.text}</span>
                ) : (
                  <span className="text-muted-foreground">{k.note ?? " "}</span>
                )}
              </div>
            </div>
            {k.extra ?? (k.trend && <Sparkline values={k.trend} color={k.trendColor} width={84} height={30} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** "↑ 20% vs 前 30 天", toned by whether up is good for this metric (null = neither). */
export function deltaOf(current: number, previous: number, days: number, upIsGood: boolean | null): Kpi["delta"] {
  if (previous === 0) return current > 0 ? { text: `前 ${days} 天沒有資料`, tone: "neutral" } : null;
  const p = Math.round(((current - previous) / previous) * 100);
  if (p === 0) return { text: `與前 ${days} 天持平`, tone: "neutral" };
  const tone = upIsGood === null ? "neutral" : p > 0 === upIsGood ? "good" : "bad";
  return { text: `${p > 0 ? "↑" : "↓"} ${Math.abs(p)}% vs 前 ${days} 天`, tone };
}

/** A rate compared in percentage points — a relative change of a percentage reads as nonsense. */
export function pointsDeltaOf(current: number | null, previous: number | null, days: number, upIsGood: boolean): Kpi["delta"] {
  if (current === null || previous === null) return null;
  const d = current - previous;
  if (d === 0) return { text: `與前 ${days} 天持平`, tone: "neutral" };
  return { text: `${d > 0 ? "↑" : "↓"} ${Math.abs(d)} 個百分點`, tone: d > 0 === upIsGood ? "good" : "bad" };
}
