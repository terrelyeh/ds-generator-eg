"use client";

import { useState } from "react";
import { Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtInt, fmtMs, fmtTokens, fmtUsd, pct } from "@/lib/analytics/format";
import type { ModelSpend, WorkspaceDetail } from "@/lib/analytics/types";
import { BarList } from "./bar-list";
import { ChartLegend, DailyChart, DailyTable } from "./daily-chart";
import { GapList } from "./gap-list";
import { KpiStrip, deltaOf, pointsDeltaOf, type Kpi } from "./kpi-strip";
import { PageHeader } from "./page-header";
import { EmptyState, Panel } from "./panel";
import { PeriodPicker } from "./period-picker";
import { QuestionsPanel } from "./questions-panel";
import { StatusPills } from "./status-pill";
import { useAnalytics, usePeriod } from "./use-analytics";
import { LoggingNote } from "./workspace-analytics";

/** One workspace: its numbers, its days, and the questions behind them. */
export function WorkspaceAnalyticsDetail({ workspaceKey }: { workspaceKey: string }) {
  const [days, setDays] = usePeriod();
  const { data, error, loading, reload } = useAnalytics<WorkspaceDetail>(`/api/analytics/workspaces/${workspaceKey}?days=${days}`);
  const [asTable, setAsTable] = useState(false);
  const w = data?.workspace;

  return (
    <div className="space-y-8">
      <PageHeader
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Workspace 分析", href: `/settings/workspace-analytics?days=${days}` },
          { label: w?.name ?? workspaceKey },
        ]}
        title={w?.name ?? workspaceKey}
        aside={
          <>
            <Button variant="ghost" size="icon-sm" onClick={() => reload()} aria-label="重新整理" disabled={loading}>
              <RotateCw className={cn("size-4", loading && "animate-spin")} />
            </Button>
            <PeriodPicker value={days} onChange={setDays} />
          </>
        }
      >
        {w && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
            {w.kind === "workspace" && <span className="font-mono text-[12px]">{w.key}</span>}
            <span>{w.entry}</span>
            {w.passcode && (
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3.5" />
                passcode
              </span>
            )}
            <StatusPills items={w.status} />
          </div>
        )}
      </PageHeader>

      {error && !data && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error === "Unknown workspace" ? "找不到這個 workspace。" : `讀取失敗：${error}`}</span>
          <Button variant="outline" size="sm" onClick={() => reload()}>再試一次</Button>
        </div>
      )}

      {!data ? (
        !error && <DetailSkeleton />
      ) : (
        <>
          <LoggingNote since={data.loggingSince} from={data.range.from} />
          <KpiStrip items={kpis(data)} dimmed={loading} />

          <Panel
            title="每日提問"
            description={`近 ${days} 天，依結果分段`}
            action={
              <div className="flex items-center gap-4">
                <ChartLegend />
                <button type="button" onClick={() => setAsTable((v) => !v)} className="text-[12.5px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
                  {asTable ? "看圖表" : "看表格"}
                </button>
              </div>
            }
          >
            <div className={cn("transition-opacity duration-200", loading && "opacity-60", asTable ? "" : "px-3 pb-1 pt-3")}>
              {asTable ? <DailyTable points={data.daily} /> : <DailyChart points={data.daily} />}
            </div>
          </Panel>

          <div className="grid items-start gap-8 lg:grid-cols-[1.7fr_1fr]">
            <QuestionsPanel workspaceKey={workspaceKey} days={days} summary={data.workspace.current} />
            <div className={cn("space-y-8 transition-opacity duration-200", loading && "opacity-60")}>
              <Panel title="知識缺口" description="依被問的次數排序">
                <GapList items={data.gaps} days={days} emptyText="這個 workspace 有人問了答不出來的問題，就會列在這裡。" />
              </Panel>
              <Panel title="最常被引用的來源">
                <BarList
                  items={data.sources.map((s) => ({ label: s.title, value: s.times }))}
                  unit="次"
                  emptyTitle="還沒有引用紀錄"
                  emptyText="回答引用了哪些資料，會依次數排在這裡。"
                />
              </Panel>
              <Panel title="模型與花費" description="來自花費帳本，8/8 起有資料">
                <ModelTable models={data.models} />
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function kpis(d: WorkspaceDetail): Kpi[] {
  const { current: c, previous: p } = d.workspace;
  const days = d.range.days;
  const rate = pct(c.noMatch, c.questions);
  // No trend lines here: the daily chart right below already draws them, and
  // at six across they would squeeze the deltas off the end of each cell.
  return [
    { label: "提問", value: fmtInt(c.questions), delta: deltaOf(c.questions, p.questions, days, true) },
    { label: d.workspace.kind === "internal" ? "使用的同事" : "訪客", value: fmtInt(c.visitors), delta: deltaOf(c.visitors, p.visitors, days, true), note: d.workspace.kind === "internal" ? "登入的帳號數" : "不重複的瀏覽器" },
    {
      label: "答不出來",
      value: rate === null ? "—" : `${rate}%`,
      delta: pointsDeltaOf(rate, pct(p.noMatch, p.questions), days, false),
    },
    { label: "錯誤", value: fmtInt(c.errors), delta: deltaOf(c.errors, p.errors, days, false), note: c.errors ? undefined : "沒有錯誤" },
    { label: "花費", value: fmtUsd(d.workspace.cost), note: c.questions ? `平均每題 ${fmtUsd(d.workspace.cost / c.questions)}` : undefined },
    {
      label: "第一個字出現",
      value: fmtMs(c.firstTokenP50Ms),
      delta: c.firstTokenP50Ms !== null && p.firstTokenP50Ms !== null ? deltaOf(c.firstTokenP50Ms, p.firstTokenP50Ms, days, false) : null,
      note: "中位數",
    },
  ];
}

function ModelTable({ models }: { models: ModelSpend[] }) {
  if (models.length === 0) return <EmptyState title="這段期間沒有模型花費" />;
  const byok = models.reduce((s, m) => s + m.byokCalls, 0);
  return (
    <div>
      <table className="w-full text-[13px]">
        <thead className="bg-muted/40 text-[12px] text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">模型</th>
            <th className="px-3 py-2 text-right font-medium">次數</th>
            <th className="px-3 py-2 text-right font-medium">Tokens</th>
            <th className="px-4 py-2 text-right font-medium">花費</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {models.map((m) => (
            <tr key={m.model} className="border-t">
              <td className="max-w-[180px] truncate px-4 py-2 font-mono text-[12px] text-foreground" title={m.model}>{m.model}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmtInt(m.calls)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmtTokens(m.tokens)}</td>
              <td className="px-4 py-2 text-right text-foreground">{fmtUsd(m.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {byok > 0 && <p className="border-t px-4 py-2 text-[12px] text-muted-foreground">另有 {byok} 次用 BYOK key，不算在花費裡。</p>}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 bg-background px-5 py-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
