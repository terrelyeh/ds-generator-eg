import Link from "next/link";
import { relativeTime } from "@/lib/analytics/format";
import type { GapItem, GapReason, PeriodDays } from "@/lib/analytics/types";
import { EmptyState } from "./panel";

const REASON: Record<GapReason, { label: (g: GapItem) => string; tone: string }> = {
  no_match: { label: () => "找不到資料", tone: "text-amber-700" },
  unhelpful: { label: () => "使用者說沒幫助", tone: "text-red-700" },
  low_similarity: {
    label: (g) => `最接近的資料只有 ${g.bestSimilarity !== null ? g.bestSimilarity.toFixed(2) : "—"}`,
    tone: "text-muted-foreground",
  },
};

/**
 * Questions the knowledge base couldn't serve, most-asked first. Each opens
 * the workspace's question list filtered to that kind of gap.
 */
export function GapList({
  items,
  days,
  showWorkspace = false,
  emptyText,
}: {
  items: GapItem[];
  days: PeriodDays;
  showWorkspace?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <EmptyState title="沒有答不出來的問題">{emptyText}</EmptyState>;
  }
  return (
    <ol className="divide-y">
      {items.map((g) => (
        <li key={`${g.key}:${g.question}`}>
          <Link
            href={`/settings/workspace-analytics/${g.key}?days=${days}&filter=${g.reason}`}
            className="group flex items-start gap-4 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
          >
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[14px] leading-snug text-foreground">{g.question}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                {showWorkspace && <span className="font-mono text-[11.5px]">{g.key}</span>}
                <span className={REASON[g.reason].tone}>{REASON[g.reason].label(g)}</span>
                <span>{relativeTime(g.lastAt)}</span>
              </p>
            </div>
            <div className="shrink-0 pt-0.5 text-right">
              <span className="text-[15px] font-semibold tabular-nums text-foreground">{g.times}</span>
              <span className="ml-0.5 text-[11.5px] text-muted-foreground">次</span>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
