"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DocLanguage } from "@/lib/website/parse";
import { daysSince, monthDay, needsAction, type MarkLocale, type TrackedVersion } from "@/lib/website/reminders";
import { SITE_CODES, SITE_LANGUAGES, type SiteCode } from "@/lib/website/sites";
import { LANGUAGE_NAME, LanguageBadge, pushText, SiteLabel, TagIcon } from "./badges";
import { formatDateTime, StatusBadge } from "./model-check-view";

/**
 * 官網查詢 · 上架追蹤 — marketing's work list.
 *
 * Top: each site's last push and how much is waiting on marketing and on the
 * pusher. Middle: every version marked 可上架 and where it stands on the sites
 * that take its language (open ones by default). Bottom: latest versions
 * nobody has marked, with what the sites already have, so the obvious ones can
 * be marked in bulk.
 *
 * Everything comes from saved checks, which the weekday daily check refreshes.
 */

export interface TrackingData {
  lastDailyCheckAt: string | null;
  canMark: boolean;
  sites: { site: SiteCode; lastPushAt: string | null; pushDetected: boolean; toHandle: number; pending: number; pendingUntracked: number }[];
  tracked: (TrackedVersion & { productId: string; locale: MarkLocale; name: string; latestVersion: string | null })[];
  unmarked: { productId: string; model: string; locale: MarkLocale; version: string; generatedAt: string; language: DocLanguage; name: string; text: string; allLive: boolean }[];
}

const LANGUAGE_SHORT: Record<DocLanguage, string> = { en: "英文", ja: "日文", zh: "繁中" };
const done = (entry: TrackingData["tracked"][number]) => entry.sites.every((s) => s.stage === "live" || s.stage === "nopage");

export function TrackingView({ data, reload }: { data: TrackingData | null; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (!data) return <div className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-sm text-slate-600">讀取上架追蹤…</div>;

  const openRows = data.tracked.filter((t) => !done(t));
  const doneRows = data.tracked.filter(done);
  const rows = filter === "open" ? openRows : filter === "done" ? doneRows : data.tracked;
  const keyOf = (row: { productId: string; locale: string }) => `${row.productId}:${row.locale}`;
  const unmarkedShown = showAll ? data.unmarked : data.unmarked.slice(0, 20);

  async function mark(entries: { productId: string; locale: MarkLocale }[], decision: "ready" | "skip") {
    if (!entries.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/website/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: entries.map((e) => ({ ...e, decision })) }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      toast.success(decision === "ready" ? `已標記 ${entries.length} 份可上架，下一次每日檢查開始追蹤` : `${entries.length} 份標為不上架`);
      setPicked(new Set());
      await reload();
    } catch (error) {
      toast.error(`標記失敗：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const pickedEntries = data.unmarked.filter((u) => picked.has(keyOf(u)));
  const card = "overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]";
  const th = "border-b-2 border-slate-300 bg-slate-100 px-3 py-2.5 text-left align-bottom text-[13px] font-semibold whitespace-nowrap text-slate-700";
  const td = "border-t border-slate-300 px-3 py-3 align-top";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-slate-600">
        {data.lastDailyCheckAt ? `每日檢查：${formatDateTime(data.lastDailyCheckAt)} · 每個工作日 09:30` : "每日檢查還沒跑過（每個工作日 09:30），下面是各型號最近一次查詢的結果"}
      </p>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {data.sites.map((s) => (
          <div key={s.site} className="flex flex-col gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 shadow-sm">
            <SiteLabel site={s.site} className="text-base" />
            <div className="flex gap-4">
              <div className="flex flex-col">
                <b className={`text-xl leading-tight tabular-nums ${s.toHandle ? "text-amber-700" : "text-slate-300"}`}>{s.toHandle}</b>
                <span className="text-xs text-slate-600">要行銷處理</span>
              </div>
              <div className="flex flex-col">
                <b className={`text-xl leading-tight tabular-nums ${s.pending ? "text-sky-700" : "text-slate-300"}`}>{s.pending}</b>
                <span className="text-xs text-slate-600">待推送</span>
              </div>
            </div>
            <span className="text-[11.5px] text-slate-500">
              {pushText(s) ?? "還沒有推送紀錄"}
              {s.pendingUntracked > 0 && `（待推送含 ${s.pendingUntracked} 份沒標記的）`}
            </span>
          </div>
        ))}
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-50 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[17px] font-bold text-slate-900">追蹤中的版本</h2>
            <p className="text-xs text-slate-600">標記「可上架」的版本在各站的進度。「—」代表這個語言不上那一站。</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ["open", "未完成", openRows.length],
              ["done", "已全部上線", doneRows.length],
              ["all", "全部", data.tracked.length],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`h-8 rounded-lg border px-3 text-xs font-medium ${filter === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {label} <span className="tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>型號</th>
                <th className={th}>標記的版本</th>
                {SITE_CODES.map((site) => (
                  <th key={site} className={th}>
                    <SiteLabel site={site} className="text-base" />
                    <span className="block text-xs font-normal text-slate-500">{SITE_LANGUAGES[site].map((l) => LANGUAGE_SHORT[l]).join("／")}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:border-t-0">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-sm text-slate-600">
                    {data.tracked.length ? "沒有符合的版本" : "還沒有標記可上架的版本。到產品頁的「官網」分頁標記，或從下面「還沒標記的最新版本」一次標記多份。"}
                  </td>
                </tr>
              )}
              {rows.map((entry) => (
                <tr key={keyOf(entry)}>
                  <td className={td}>
                    <Link href={`/product/${encodeURIComponent(entry.model)}`} className="whitespace-nowrap text-[15px] font-semibold text-slate-900 hover:text-sky-700 hover:underline">
                      {entry.model}
                    </Link>
                    <span className="mt-0.5 block text-xs text-slate-500">{entry.name}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-1.5 text-[15px] text-slate-700">
                      <LanguageBadge language={entry.language} size="sm" />
                      {LANGUAGE_SHORT[entry.language]} <b className="font-bold tabular-nums text-slate-900">v{entry.version}</b>
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{monthDay(entry.markedAt)} 標記</span>
                    {entry.regenerated && <span className="block text-xs font-semibold text-amber-700">標記後重產過</span>}
                    {entry.latestVersion && entry.latestVersion !== entry.version && <span className="block text-xs text-slate-500">最新 v{entry.latestVersion} 還沒標記</span>}
                  </td>
                  {SITE_CODES.map((site) => {
                    const s = entry.sites.find((x) => x.site === site);
                    if (!s) return <td key={site} className={`${td} text-slate-400`}>—</td>;
                    const line =
                      s.stage === "upload" ? `標記後 ${daysSince(entry.markedAt, new Date())} 天`
                      : s.status === "prodnewer" ? "推送前要先補傳測試站"
                      : s.stage === "fix" || s.stage === "push" ? s.why
                      : s.stage === "nopage" ? "不追蹤"
                      : s.stage === "unknown" ? "還沒查過"
                      : "";
                    return (
                      <td key={site} className={td}>
                        {s.status && s.stage !== "unknown" ? <StatusBadge status={s.status} /> : <span className="py-1 text-xs text-slate-500">還沒查過</span>}
                        {line && s.stage !== "unknown" && (
                          <span className={`mt-1.5 block max-w-[220px] text-xs leading-snug ${needsAction(s.stage) ? "text-slate-700" : "text-slate-500"}`}>{line}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <div className="border-b border-slate-300 bg-slate-50 px-4 py-3 sm:px-5">
          <h2 className="text-[17px] font-bold text-slate-900">
            還沒標記的最新版本 <span className="tabular-nums text-amber-700">{data.unmarked.length}</span>
          </h2>
          <p className="text-xs text-slate-600">Active 產品、產出超過 7 天，還沒標記可上架或不上架。站上已經是這一版的（綠字），可以直接勾起來一次標記。</p>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
          {data.canMark && pickedEntries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm text-white">
              <span>
                已選 <b className="tabular-nums">{pickedEntries.length}</b> 份
              </span>
              <Button size="sm" className="h-7 bg-white font-semibold text-sky-800 hover:bg-sky-50" disabled={busy} onClick={() => void mark(pickedEntries, "ready")}>
                <TagIcon />
                標記可上架
              </Button>
              <Button size="sm" variant="outline" className="h-7 border-slate-500 bg-transparent text-white hover:bg-slate-800 hover:text-white" disabled={busy} onClick={() => void mark(pickedEntries, "skip")}>
                不上架
              </Button>
              <button type="button" className="ml-auto text-xs text-slate-300 hover:text-white" onClick={() => setPicked(new Set())}>
                取消選取
              </button>
            </div>
          )}
          {data.unmarked.length === 0 ? (
            <p className="text-sm text-emerald-800">✓ 超過 7 天的最新版本都標記過了</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-400">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr>
                    {data.canMark && (
                      <th className={`${th} w-10`}>
                        <input
                          type="checkbox"
                          aria-label="全選"
                          className="h-4 w-4 accent-slate-900"
                          checked={unmarkedShown.length > 0 && unmarkedShown.every((u) => picked.has(keyOf(u)))}
                          onChange={(e) => setPicked(e.target.checked ? new Set(unmarkedShown.map(keyOf)) : new Set())}
                        />
                      </th>
                    )}
                    <th className={th}>型號</th>
                    <th className={th}>版本</th>
                    <th className={th}>產出</th>
                    <th className={th}>站上現況</th>
                    {data.canMark && <th className={th} />}
                  </tr>
                </thead>
                <tbody className="[&>tr:first-child>td]:border-t-0">
                  {unmarkedShown.map((u) => (
                    <tr key={keyOf(u)}>
                      {data.canMark && (
                        <td className={td}>
                          <input
                            type="checkbox"
                            aria-label={`選取 ${u.model} ${LANGUAGE_SHORT[u.language]} v${u.version}`}
                            className="h-4 w-4 accent-slate-900"
                            checked={picked.has(keyOf(u))}
                            onChange={(e) =>
                              setPicked((current) => {
                                const next = new Set(current);
                                if (e.target.checked) next.add(keyOf(u));
                                else next.delete(keyOf(u));
                                return next;
                              })
                            }
                          />
                        </td>
                      )}
                      <td className={td}>
                        <Link href={`/product/${encodeURIComponent(u.model)}`} className="whitespace-nowrap text-[15px] font-semibold text-slate-900 hover:text-sky-700 hover:underline">
                          {u.model}
                        </Link>
                        <span className="mt-0.5 block text-xs text-slate-500">{u.name}</span>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-1.5 text-[15px] text-slate-700">
                          <LanguageBadge language={u.language} size="sm" />
                          {LANGUAGE_NAME[u.language]} <b className="font-bold tabular-nums text-slate-900">v{u.version}</b>
                        </span>
                      </td>
                      <td className={`${td} whitespace-nowrap text-[13px] tabular-nums text-slate-600`}>
                        {monthDay(u.generatedAt)}
                        <span className="block text-xs text-slate-500">{daysSince(u.generatedAt, new Date())} 天前</span>
                      </td>
                      <td className={`${td} text-[13.5px] ${u.allLive ? "font-semibold text-emerald-700" : "text-slate-700"}`}>{u.text}</td>
                      {data.canMark && (
                        <td className={`${td} whitespace-nowrap text-right`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-sky-300 bg-white font-semibold text-sky-700 hover:bg-sky-50"
                            disabled={busy}
                            onClick={() => void mark([u], "ready")}
                          >
                            標記可上架
                          </Button>
                          <button type="button" disabled={busy} onClick={() => void mark([u], "skip")} className="ml-3 text-xs text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-50">
                            不上架
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!showAll && data.unmarked.length > unmarkedShown.length && (
            <Button size="sm" variant="outline" className="self-start" onClick={() => setShowAll(true)}>
              顯示全部 {data.unmarked.length} 份
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
