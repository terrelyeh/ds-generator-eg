"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface KeyInfo {
  label: string;
  limit: number | null;
  limit_remaining: number | null;
  is_free_tier: boolean;
  usage: number;
  usage_daily: number;
  usage_weekly: number;
  usage_monthly: number;
  byok_usage: number;
}

interface Credits {
  total_credits: number;
  total_usage: number;
}

interface ActivityRow {
  date: string;
  model: string;
  provider_name: string;
  requests: number;
  usage: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
}

interface Snapshot {
  key: KeyInfo | null;
  credits: Credits | null;
  activity: ActivityRow[] | null;
  warnings: string[];
  managementKeyConfigured: boolean;
  fetchedAt: string;
}

/** LLM line items are often fractions of a cent — flat 2dp would read $0.00. */
function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (Math.abs(n) < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "bad"
      ? "text-rose-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "good"
          ? "text-emerald-600"
          : "text-[#231f20]";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400 tabular-nums">{sub}</div>}
    </div>
  );
}

export function AiUsageDashboard() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/openrouter/usage${refresh ? "?refresh=1" : ""}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "讀取失敗");
        return;
      }
      setData(json);
      if (refresh) toast.success("已更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return <div className="py-16 text-center text-sm text-slate-400">讀取中…</div>;
  }
  if (!data) return null;

  const { key, credits, activity, warnings } = data;

  const remaining = credits ? credits.total_credits - credits.total_usage : null;

  // Prefer the 7-day average over today's partial day — a refresh at 09:00
  // would otherwise read as a near-zero burn rate and inflate the runway.
  const dailyBurn = key ? key.usage_weekly / 7 : null;
  const daysLeft =
    remaining !== null && dailyBurn && dailyBurn > 0 ? remaining / dailyBurn : null;

  const runwayTone =
    daysLeft === null ? "default" : daysLeft < 14 ? "bad" : daysLeft < 45 ? "warn" : "good";

  // Activity arrives per endpoint per day; roll it up two ways.
  const byDate = new Map<string, number>();
  const byModel = new Map<string, { usage: number; requests: number; tokens: number; provider: string }>();
  for (const r of activity ?? []) {
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.usage);
    const m = byModel.get(r.model) ?? { usage: 0, requests: 0, tokens: 0, provider: r.provider_name };
    m.usage += r.usage;
    m.requests += r.requests;
    m.tokens += r.prompt_tokens + r.completion_tokens + r.reasoning_tokens;
    byModel.set(r.model, m);
  }
  const days = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const peak = Math.max(0, ...days.map(([, v]) => v));
  const models = [...byModel.entries()].sort((a, b) => b[1].usage - a[1].usage);
  const totalModelSpend = models.reduce((s, [, m]) => s + m.usage, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#231f20]">AI 用量與餘額</h1>
          <p className="mt-1 text-sm text-slate-500">
            OpenRouter 帳戶餘額、燒錢速率與各模型花費。
            {data.fetchedAt && (
              <span className="ml-1 tabular-nums text-slate-400">
                資料時間 {new Date(data.fetchedAt).toLocaleString("zh-TW")}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            {loading ? "更新中…" : "重新整理"}
          </Button>
          <Link href="https://openrouter.ai/credits" target="_blank" rel="noopener noreferrer">
            <Button size="sm">前往儲值</Button>
          </Link>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ul className="list-inside list-disc space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {!data.managementKeyConfigured && (
            <p className="mt-2 text-xs text-amber-700">
              帳戶餘額與各模型花費需要 <code className="font-mono">OPENROUTER_MANAGEMENT_KEY</code>{" "}
              環境變數。它的權限高於一般 inference key（可建立／刪除 API key、讀取帳務），
              所以刻意不放在 API Keys 設定頁，避免明文存進資料庫。
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="剩餘額度"
          value={usd(remaining)}
          sub={credits ? `已儲值 ${usd(credits.total_credits)} · 已用 ${usd(credits.total_usage)}` : "需要 management key"}
          tone={runwayTone}
        />
        <Stat
          label="預估可用天數"
          value={daysLeft === null ? "—" : `${Math.floor(daysLeft)} 天`}
          sub={dailyBurn ? `以每日 ${usd(dailyBurn)} 估算` : undefined}
          tone={runwayTone}
        />
        <Stat
          label="近 7 天花費"
          value={usd(key?.usage_weekly)}
          sub={key ? `今日 ${usd(key.usage_daily)}` : undefined}
        />
        <Stat
          label="近 30 天花費"
          value={usd(key?.usage_monthly)}
          sub={key ? `此 key 累計 ${usd(key.usage)}` : undefined}
        />
      </div>

      {key && (
        <p className="text-xs text-slate-400">
          用量數字來自 key「{key.label}」
          {key.limit !== null && <> · 上限 {usd(key.limit)}，剩餘 {usd(key.limit_remaining)}</>}
          {key.is_free_tier && <> · free tier</>}
        </p>
      )}

      {days.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">每日花費（近 30 天）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="flex min-w-[560px] items-end gap-1" style={{ height: 160 }}>
                {days.map(([date, usage]) => (
                  <div key={date} className="group flex flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[10px] tabular-nums text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
                      {usd(usage)}
                    </span>
                    <div
                      className="w-full rounded-t bg-[#03a9f4] transition-colors group-hover:bg-[#0288d1]"
                      style={{ height: peak > 0 ? `${Math.max(2, (usage / peak) * 130)}px` : "2px" }}
                      title={`${date} — ${usd(usage)}`}
                    />
                    <span className="text-[9px] tabular-nums text-slate-400">
                      {date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {models.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">各模型花費（近 30 天）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 text-left font-medium">模型</th>
                    <th className="py-2 text-left font-medium">Provider</th>
                    <th className="py-2 text-right font-medium">請求數</th>
                    <th className="py-2 text-right font-medium">Tokens</th>
                    <th className="py-2 text-right font-medium">花費</th>
                    <th className="py-2 text-right font-medium">佔比</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map(([model, m]) => {
                    const pct = totalModelSpend > 0 ? (m.usage / totalModelSpend) * 100 : 0;
                    return (
                      <tr key={model} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs text-[#231f20]">{model}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500">{m.provider}</td>
                        <td className="py-2 text-right tabular-nums text-slate-600">
                          {compact(m.requests)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-slate-600">
                          {compact(m.tokens)}
                        </td>
                        <td className="py-2 text-right tabular-nums font-medium text-[#231f20]">
                          {usd(m.usage)}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-[#03a9f4]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-10 text-right tabular-nums text-xs text-slate-500">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
