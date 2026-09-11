"use client";

import { cn } from "@/lib/utils";
import { PERIODS, type PeriodDays } from "@/lib/analytics/types";

export function PeriodPicker({ value, onChange }: { value: PeriodDays; onChange: (d: PeriodDays) => void }) {
  return (
    <div role="radiogroup" aria-label="期間" className="inline-flex rounded-lg bg-muted p-0.5">
      {PERIODS.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          onClick={() => onChange(d)}
          className={cn(
            "rounded-md px-3 py-1 text-[13px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-engenius-blue/40",
            value === d
              ? "bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          近 {d} 天
        </button>
      ))}
    </div>
  );
}
