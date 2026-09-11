import { CHART } from "./chart-theme";
import { EmptyState } from "./panel";

/** Ranked counts with a bar each — the label reads first, the bar shows the proportion. */
export function BarList({
  items,
  unit,
  emptyTitle,
  emptyText,
}: {
  items: { label: string; value: number; hint?: string }[];
  unit: string;
  emptyTitle: string;
  emptyText?: string;
}) {
  if (items.length === 0) return <EmptyState title={emptyTitle}>{emptyText}</EmptyState>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3.5 px-4 py-4">
      {items.map((it) => (
        <li key={it.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13.5px] text-foreground" title={it.label}>{it.label}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
              {it.value} {unit}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, background: CHART.answered }} />
          </div>
          {it.hint && <p className="mt-1 text-[11.5px] text-muted-foreground">{it.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
