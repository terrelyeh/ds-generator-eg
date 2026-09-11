"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtInt, fmtUsd, pct, relativeTime, shortDate } from "@/lib/analytics/format";
import type { PeriodDays, WorkspaceRow } from "@/lib/analytics/types";
import { CHART } from "./chart-theme";
import { Sparkline } from "./sparkline";
import { StatusPills } from "./status-pill";

type SortKey = "questions" | "visitors" | "noMatch" | "errors" | "cost" | "lastAt";

const value = (r: WorkspaceRow, k: SortKey): number => {
  switch (k) {
    case "questions": return r.current.questions;
    case "visitors": return r.current.visitors;
    case "noMatch": return r.current.questions ? r.current.noMatch / r.current.questions : -1;
    case "errors": return r.current.errors;
    case "cost": return r.cost;
    case "lastAt": return r.lastAt ? Date.parse(r.lastAt) : 0;
  }
};

/**
 * Every workspace, then the Ask traffic that isn't one (internal /ask, the
 * demo) under its own label — sorted within each group, so the rows that
 * aren't departments never mix into the ranking.
 */
export function WorkspaceTable({ rows, days, dimmed }: { rows: WorkspaceRow[]; days: PeriodDays; dimmed?: boolean }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "questions", desc: true });
  const maxQuestions = Math.max(1, ...rows.map((r) => r.current.questions));

  const groups = useMemo(() => {
    const order = (list: WorkspaceRow[]) =>
      [...list].sort((a, b) => (value(b, sort.key) - value(a, sort.key)) * (sort.desc ? 1 : -1) || a.name.localeCompare(b.name));
    return [order(rows.filter((r) => r.kind === "workspace")), order(rows.filter((r) => r.kind !== "workspace"))];
  }, [rows, sort]);

  const head = (label: string, key: SortKey | null, align: "left" | "right" = "right") => {
    const active = key && sort.key === key;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
        className={cn("whitespace-nowrap px-3 py-2.5 text-[12px] font-medium text-muted-foreground", align === "right" ? "text-right" : "text-left")}
      >
        {key ? (
          <button
            type="button"
            onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
            className={cn("inline-flex items-center gap-1 rounded transition-colors hover:text-foreground", active && "text-foreground")}
          >
            {label}
            {active && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
          </button>
        ) : (
          label
        )}
      </th>
    );
  };

  const href = (r: WorkspaceRow) => `/settings/workspace-analytics/${r.key}?days=${days}`;

  const row = (r: WorkspaceRow) => {
    const quiet = r.current.questions === 0;
    const rate = pct(r.current.noMatch, r.current.questions);
    const highMiss = r.current.questions >= 5 && rate !== null && rate >= 20;
    return (
      <tr key={r.key} onClick={() => router.push(href(r))} className="group cursor-pointer border-t transition-colors hover:bg-muted/40">
        <td className="py-3 pl-4 pr-3">
          <Link href={href(r)} onClick={(e) => e.stopPropagation()} className="block min-w-[190px] focus-visible:outline-none">
            <span className={cn("text-[14px] font-medium", quiet && r.cost === 0 ? "text-muted-foreground" : "text-foreground")}>{r.name}</span>
            <span className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
              {r.kind === "workspace" && <span className="font-mono text-[11.5px]">{r.key}</span>}
              <span className="truncate">{r.entry}</span>
              {r.passcode && <Lock className="size-3 shrink-0" aria-label="需要 passcode" />}
            </span>
          </Link>
        </td>
        <td className="px-3 py-3 text-right">
          <div className="flex items-center justify-end gap-2.5">
            <span className="hidden h-1 w-14 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${(r.current.questions / maxQuestions) * 100}%`, background: CHART.answered }} />
            </span>
            <span className={cn("min-w-[2.5em] text-[14px] tabular-nums", quiet ? "text-muted-foreground" : "font-medium text-foreground")}>
              {fmtInt(r.current.questions)}
            </span>
          </div>
        </td>
        <td className="px-3 py-3 text-right text-[14px] tabular-nums text-muted-foreground">{r.current.visitors || "—"}</td>
        <td className="px-3 py-3">
          <Sparkline values={r.daily} label={`${r.name} 近 ${days} 天每日提問`} />
        </td>
        <td className={cn("px-3 py-3 text-right text-[14px] tabular-nums", highMiss ? "text-amber-700" : "text-muted-foreground")} title={`${r.current.noMatch} / ${r.current.questions} 題找不到資料`}>
          {rate === null ? "—" : `${rate}%`}
        </td>
        <td className={cn("px-3 py-3 text-right text-[14px] tabular-nums", r.current.errors > 0 ? "font-medium text-red-700" : "text-muted-foreground")}>
          {r.current.errors}
        </td>
        <td className="px-3 py-3 text-right text-[14px] tabular-nums text-foreground">{r.cost > 0 ? fmtUsd(r.cost) : <span className="text-muted-foreground">—</span>}</td>
        <td className="whitespace-nowrap px-3 py-3 text-[13px] text-muted-foreground" title={r.lastAt ? shortDate(r.lastAt) : undefined}>
          {r.lastAt ? relativeTime(r.lastAt) : "—"}
        </td>
        <td className="py-3 pl-3 pr-2">
          <StatusPills items={r.status} />
        </td>
        <td className="w-8 py-3 pr-3 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground">
          <ChevronRight className="size-4" />
        </td>
      </tr>
    );
  };

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-background transition-opacity duration-200", dimmed && "opacity-60")}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-muted/40">
            <tr>
              <th scope="col" className="py-2.5 pl-4 pr-3 text-left text-[12px] font-medium text-muted-foreground">Workspace</th>
              {head("提問", "questions")}
              {head("訪客", "visitors")}
              <th scope="col" className="px-3 py-2.5 text-left text-[12px] font-medium text-muted-foreground">每日提問</th>
              {head("答不出來", "noMatch")}
              {head("錯誤", "errors")}
              {head("花費", "cost")}
              {head("最後使用", "lastAt", "left")}
              <th scope="col" className="px-3 py-2.5 text-left text-[12px] font-medium text-muted-foreground">狀態</th>
              <th scope="col" className="w-8"><span className="sr-only">開啟</span></th>
            </tr>
          </thead>
          <tbody>
            {groups[0].map(row)}
            {groups[1].length > 0 && (
              <tr className="border-t bg-muted/25">
                <td colSpan={10} className="px-4 py-1.5 text-[11.5px] font-medium tracking-[0.06em] text-muted-foreground">不屬於任何 workspace</td>
              </tr>
            )}
            {groups[1].map(row)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
