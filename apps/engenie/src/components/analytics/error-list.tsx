import Link from "next/link";
import { relativeTime, shortDate } from "@/lib/analytics/format";
import type { ErrorItem, PeriodDays } from "@/lib/analytics/types";
import { EmptyState } from "./panel";

/** The newest failures, with the message the route recorded — enough to tell a bad model id from a search outage. */
export function ErrorList({ items, days }: { items: ErrorItem[]; days: PeriodDays }) {
  if (items.length === 0) {
    return <EmptyState title="這段期間沒有錯誤">模型設定錯誤、搜尋服務中斷這類問題，發生當下就會出現在這裡。</EmptyState>;
  }
  return (
    <ol className="divide-y">
      {items.map((e) => (
        <li key={e.id}>
          <Link
            href={`/settings/workspace-analytics/${e.key}?days=${days}&filter=error`}
            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
          >
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-words text-[13px] leading-snug text-foreground">{e.error}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                <span className="font-mono text-[11.5px]">{e.key}</span>
                {e.model && <span className="font-mono text-[11.5px]">{e.model}</span>}
                <span title={shortDate(e.at)}>{relativeTime(e.at)}</span>
              </p>
              {e.question && <p className="mt-1 line-clamp-1 text-[12px] text-muted-foreground">問：{e.question}</p>}
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
