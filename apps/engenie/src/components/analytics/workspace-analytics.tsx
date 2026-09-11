"use client";

import { Info, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtInt, fmtUsd, pct, shortDate } from "@/lib/analytics/format";
import type { AnalyticsOverview, WorkspaceRow } from "@/lib/analytics/types";
import { CHART } from "./chart-theme";
import { ErrorList } from "./error-list";
import { GapList } from "./gap-list";
import { KpiStrip, deltaOf, pointsDeltaOf, type Kpi } from "./kpi-strip";
import { PageHeader } from "./page-header";
import { Panel } from "./panel";
import { PeriodPicker } from "./period-picker";
import { useAnalytics, usePeriod } from "./use-analytics";
import { WorkspaceTable } from "./workspace-table";

/** Settings ▸ Workspace 分析 — who uses which workspace, what they ask, what fails, what it costs. */
export function WorkspaceAnalytics() {
  const [days, setDays] = usePeriod();
  const { data, error, loading, reload } = useAnalytics<AnalyticsOverview>(`/api/analytics/workspaces?days=${days}`);

  return (
    <div className="space-y-8">
      <PageHeader
        crumbs={[{ label: "Settings", href: "/settings" }, { label: "Workspace 分析" }]}
        title="Workspace 分析"
        description="每個 workspace 有多少人在用、問了什麼、哪些問題知識庫答不出來，以及各花了多少。"
        aside={
          <>
            {data && (
              <span className="hidden text-[12px] tabular-nums text-muted-foreground sm:inline">
                {error ? <span className="text-red-700">更新失敗</span> : `更新於 ${new Date(data.generatedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`}
              </span>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => reload()} aria-label="重新整理" disabled={loading}>
              <RotateCw className={cn("size-4", loading && "animate-spin")} />
            </Button>
            <PeriodPicker value={days} onChange={setDays} />
          </>
        }
      />

      {error && !data && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>讀取失敗：{error}</span>
          <Button variant="outline" size="sm" onClick={() => reload()}>再試一次</Button>
        </div>
      )}

      {!data ? (
        !error && <OverviewSkeleton />
      ) : (
        <>
          <LoggingNote since={data.loggingSince} from={data.range.from} />
          <KpiStrip items={kpis(data)} dimmed={loading} />
          <Panel title="各 workspace" description="點一列，看這個 workspace 問了什麼、哪些答不出來。" frameless>
            <WorkspaceTable rows={data.rows} days={days} dimmed={loading} />
          </Panel>
          <div className={cn("grid items-start gap-8 transition-opacity duration-200 lg:grid-cols-[1.55fr_1fr]", loading && "opacity-60")}>
            <Panel title="知識缺口" description="找不到資料、最接近的資料也不夠像，或使用者按了沒幫助的問題。">
              <GapList items={data.gaps} days={days} showWorkspace emptyText="有人問了知識庫答不出來的問題，就會列在這裡，依被問的次數排序。" />
            </Panel>
            <Panel title="最近的錯誤">
              <ErrorList items={data.errors} days={days} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function kpis(d: AnalyticsOverview): Kpi[] {
  const { current: c, previous: p } = d.totals;
  const days = d.range.days;
  const rate = pct(c.noMatch, c.questions);
  const workspaces = d.rows.filter((r) => r.kind === "workspace");
  const idle = workspaces.filter((r) => r.current.questions === 0 && r.cost === 0);
  return [
    { label: "提問", value: fmtInt(c.questions), delta: deltaOf(c.questions, p.questions, days, true), trend: d.dailyQuestions },
    {
      label: "有人在用的 workspace",
      value: String(c.activeWorkspaces),
      unit: `/ ${c.totalWorkspaces}`,
      note: idle.length ? `沒人用：${idle.slice(0, 3).map((r) => r.key).join("、")}${idle.length > 3 ? ` 等 ${idle.length} 個` : ""}` : "每個都有人用",
      extra: <ActiveSquares rows={workspaces} />,
    },
    {
      label: "答不出來的比例",
      value: rate === null ? "—" : `${rate}%`,
      delta: pointsDeltaOf(rate, pct(p.noMatch, p.questions), days, false),
      note: `${fmtInt(c.noMatch)} 題找不到資料`,
      trend: d.dailyNoMatch,
      trendColor: CHART.noMatch,
    },
    {
      label: "花費",
      value: fmtUsd(c.cost),
      delta: deltaOf(c.cost, p.cost, days, null),
      note: c.questions ? `平均每題 ${fmtUsd(c.cost / c.questions)}` : undefined,
    },
  ];
}

/** One square per workspace — filled when it saw use in the window. */
function ActiveSquares({ rows }: { rows: WorkspaceRow[] }) {
  return (
    <div className="flex max-w-[112px] flex-wrap justify-end gap-1 pb-1" aria-hidden>
      {rows.map((r) => {
        const active = r.current.questions > 0 || r.cost > 0;
        return (
          <span
            key={r.key}
            title={`${r.name}：${r.current.questions} 題`}
            className={cn("size-2.5 rounded-[3px]", active ? "" : "border border-neutral-300")}
            style={active ? { background: CHART.answered } : undefined}
          />
        );
      })}
    </div>
  );
}

export function LoggingNote({ since, from }: { since: string | null; from: string }) {
  if (since && Date.parse(since) <= Date.parse(from)) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" />
      {since
        ? `提問紀錄從 ${shortDate(since)} 開始，在這之前只有花費資料（8/8 起）。`
        : "還沒有提問紀錄。新的提問會自動記錄；花費資料從 8/8 起就有。"}
    </p>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 bg-background px-5 py-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-xl border p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
