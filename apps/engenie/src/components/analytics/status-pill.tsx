import { cn } from "@/lib/utils";
import type { StatusBadge, StatusTone } from "@/lib/analytics/types";

const TONE: Record<StatusTone, string> = {
  good: "text-emerald-700 before:bg-emerald-500",
  warn: "text-amber-700 before:bg-amber-500",
  crit: "text-red-700 before:bg-red-500",
  idle: "text-muted-foreground before:bg-neutral-300",
};

/** A dot and a few words. Colour is never the only cue — the words say it. */
export function StatusPill({ tone, label }: StatusBadge) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] leading-none before:size-1.5 before:shrink-0 before:rounded-full before:content-['']",
        TONE[tone],
      )}
    >
      {label}
    </span>
  );
}

export function StatusPills({ items }: { items: StatusBadge[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((s) => (
        <StatusPill key={s.label} {...s} />
      ))}
    </div>
  );
}
