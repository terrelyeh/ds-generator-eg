"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { SiteVerdict, SpecHubBaseline } from "@/lib/website/compare";
import { SITE_CODES, type SiteCode } from "@/lib/website/sites";
import { IssueList, ModelCheckView, type SiteState } from "./model-check-view";
import { SiteQueryView } from "./site-query-view";
import { TrackingView, type TrackingData } from "./tracking-view";

/**
 * 官網查詢: check datasheets on the regional sites without going through a
 * product page — by model (any model, SpecHub's or not) or by site and
 * category. A model checked here is saved, so its product page shows it too.
 */

interface ModelResult {
  productModel: string | null;
  baseline: SpecHubBaseline | undefined;
  sites: Record<SiteCode, SiteState>;
  variants: string[];
}

const RECENT_KEY = "spechub:website-check:recent";
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((m): m is string => typeof m === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeRecent(models: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(models.slice(0, 8)));
  } catch {
    // Private windows and blocked storage: recent models are a convenience.
  }
}

const blankSites = (loading: boolean) =>
  Object.fromEntries(SITE_CODES.map((site) => [site, { site, verdict: null, checkedAt: null, loading, error: null }])) as Record<SiteCode, SiteState>;

type Mode = "model" | "site" | "tracking";
const MODE_LABEL: Record<Mode, string> = { model: "依型號", site: "依站台", tracking: "上架追蹤" };

export function WebsiteQuery() {
  const [mode, setMode] = useState<Mode>("model");
  const [chips, setChips] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, ModelResult>>({});
  const [order, setOrder] = useState<string[]>([]);

  const [tracking, setTracking] = useState<TrackingData | null>(null);

  useEffect(() => setRecent(readRecent()), []);

  // ?tab=tracking — the marketing digest links straight to the work list.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "tracking" || tab === "site") setMode(tab);
  }, []);

  const loadTracking = useCallback(async () => {
    const res = await fetch("/api/website/tracking", { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as (TrackingData & { error?: string }) | null;
    if (!res.ok || !body) {
      toast.error(body?.error ?? "讀不到上架追蹤");
      return;
    }
    setTracking(body);
  }, []);

  useEffect(() => {
    void loadTracking();
  }, [loadTracking]);

  function switchMode(next: Mode) {
    setMode(next);
    const url = new URL(window.location.href);
    if (next === "model") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  /** Typed or pasted text may hold several models: "ECW536 EWS377-FIT, ECW230". */
  function splitModels(text: string): string[] {
    const parts = text.split(/[\s,，、;；]+/).map((p) => p.trim().toUpperCase()).filter(Boolean);
    const bad = parts.filter((p) => !MODEL_PATTERN.test(p));
    if (bad.length) toast.error(`「${bad.join("、")}」不像型號，只能有英數字和連字號`);
    return parts.filter((p) => MODEL_PATTERN.test(p));
  }

  function addChip(value: string) {
    const models = splitModels(value);
    if (models.length) setChips((current) => [...new Set([...current, ...models])]);
    setDraft("");
  }

  async function checkOne(model: string) {
    setResults((current) => ({ ...current, [model]: { productModel: null, baseline: undefined, variants: [], sites: blankSites(true) } }));
    await Promise.all(
      SITE_CODES.map(async (site) => {
        try {
          const res = await fetch("/api/website/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, site }),
          });
          const data = (await res.json().catch(() => null)) as {
            productModel: string | null;
            baseline: SpecHubBaseline;
            verdict: SiteVerdict;
            checkedAt: string;
            variants: string[];
            error?: string;
          } | null;
          if (!res.ok || !data?.verdict) throw new Error(data?.error ?? `HTTP ${res.status}`);
          setResults((current) => {
            const entry = current[model];
            return {
              ...current,
              [model]: {
                productModel: data.productModel,
                baseline: data.baseline,
                variants: [...new Set([...entry.variants, ...data.variants])].sort(),
                sites: { ...entry.sites, [site]: { site, verdict: data.verdict, checkedAt: data.checkedAt, loading: false, error: null } },
              },
            };
          });
        } catch (error) {
          setResults((current) => ({
            ...current,
            [model]: { ...current[model], sites: { ...current[model].sites, [site]: { ...current[model].sites[site], loading: false, error: (error as Error).message } } },
          }));
        }
      }),
    );
  }

  async function runModels(models: string[]) {
    if (!models.length) return;
    setOrder(models);
    const nextRecent = [...models, ...recent.filter((m) => !models.includes(m))].slice(0, 8);
    setRecent(nextRecent);
    writeRecent(nextRecent);
    // Two models at a time: five site requests each is already ten reads of the WordPress sites.
    for (let i = 0; i < models.length; i += 2) await Promise.all(models.slice(i, i + 2).map(checkOne));
    toast.success(`查詢完成：${models.length} 個型號`);
  }

  async function retrySite(model: string, site: SiteCode) {
    setResults((current) => ({ ...current, [model]: { ...current[model], sites: { ...current[model].sites, [site]: { ...current[model].sites[site], loading: true, error: null } } } }));
    const res = await fetch("/api/website/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, site }) });
    const data = (await res.json().catch(() => null)) as { verdict?: SiteVerdict; checkedAt?: string; error?: string } | null;
    setResults((current) => ({
      ...current,
      [model]: {
        ...current[model],
        sites: {
          ...current[model].sites,
          [site]: data?.verdict
            ? { site, verdict: data.verdict, checkedAt: data.checkedAt ?? null, loading: false, error: null }
            : { ...current[model].sites[site], loading: false, error: data?.error ?? `HTTP ${res.status}` },
        },
      },
    }));
  }

  function openModel(model: string) {
    switchMode("model");
    setChips([model]);
    void runModels([model]);
  }

  const busy = order.some((m) => results[m] && SITE_CODES.some((s) => results[m].sites[s].loading));
  const allIssues = order.flatMap((m) => SITE_CODES.flatMap((s) => results[m]?.sites[s].verdict?.issues ?? []).filter((i) => !i.includes("查詢失敗")).map((i) => `${m} ${i}`));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">官網查詢</h1>
        <p className="mt-1 text-sm text-slate-600">直接讀取 EU、JP、TW、APAC、IN 五個官網的正式站和測試站，對照 SpecHub 目前的版本。只讀取，不會修改網站。</p>
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-slate-200/70 p-1" role="tablist" aria-label="查詢方式">
        {(["model", "site", "tracking"] as const).map((key) => {
          const todo = key === "tracking" && tracking ? tracking.sites.reduce((sum, s) => sum + s.toHandle, 0) : 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => switchMode(key)}
              className={`rounded-md px-4 py-2 text-sm transition-all ${mode === key ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-black/5" : "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900"}`}
            >
              {MODE_LABEL[key]}
              {todo > 0 && <span className="ml-1.5 font-semibold tabular-nums text-amber-700">{todo}</span>}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl bg-slate-100 p-3 sm:p-4">
        {mode === "tracking" ? (
          <TrackingView data={tracking} reload={loadTracking} />
        ) : mode === "site" ? (
          <SiteQueryView onOpenModel={openModel} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)] sm:p-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <label htmlFor="website-model-input" className="text-xs font-medium text-slate-600">
                    型號（可以一次輸入好幾個，按 Enter 加入）
                  </label>
                  <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1">
                    {chips.map((chip) => (
                      <span key={chip} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 py-0.5 pl-2 pr-1 font-mono text-xs text-slate-800">
                        {chip}
                        <button type="button" aria-label={`移除 ${chip}`} onClick={() => setChips(chips.filter((c) => c !== chip))} className="px-1 text-slate-500 hover:text-slate-700">
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      id="website-model-input"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "," || e.key === " ") {
                          e.preventDefault();
                          addChip(draft);
                        } else if (e.key === "Backspace" && !draft && chips.length) {
                          setChips(chips.slice(0, -1));
                        }
                      }}
                      placeholder={chips.length ? "" : "例如 ECW536"}
                      className="min-w-[140px] flex-1 border-0 bg-transparent py-1 text-sm outline-none"
                    />
                  </div>
                </div>
                <Button
                  className="h-9"
                  disabled={busy || (!chips.length && !draft.trim())}
                  onClick={() => {
                    const models = [...new Set([...chips, ...splitModels(draft)])];
                    setChips(models);
                    setDraft("");
                    void runModels(models);
                  }}
                >
                  {busy ? "查詢中…" : "查詢"}
                </Button>
              </div>
              {recent.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                  <span>最近查過</span>
                  {recent.map((model) => (
                    <button key={model} type="button" onClick={() => addChip(model)} className="font-mono text-sky-700 hover:underline">
                      {model}
                    </button>
                  ))}
                </p>
              )}
            </div>

            {order.length > 0 && !busy && allIssues.length > 0 && order.length > 1 && (
              <IssueList issues={allIssues} title={`${order.length} 個型號，共 ${allIssues.length} 件事要處理`} />
            )}

            {order.map((model) => {
              const entry = results[model];
              if (!entry) return null;
              const states = SITE_CODES.map((s) => entry.sites[s]);
              const done = states.every((s) => !s.loading);
              const nowhere = done && entry.baseline === null && states.every((s) => s.verdict?.status === "nopage");
              return (
                <section
                  key={model}
                  className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-300 bg-slate-50 px-4 py-3 sm:px-5">
                    <h2 className="font-heading text-xl font-bold text-slate-900">{model}</h2>
                    {entry.productModel ? (
                      <Link href={`/product/${encodeURIComponent(entry.productModel)}`} className="text-xs text-sky-700 hover:underline">
                        產品頁 →
                      </Link>
                    ) : entry.baseline === null ? (
                      <span className="rounded-[5px] border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-600">不在 SpecHub</span>
                    ) : null}
                    {entry.variants.filter((v) => !chips.includes(v)).length > 0 && (
                      <span className="text-xs text-slate-600">
                        相近型號{" "}
                        {entry.variants
                          .filter((v) => !chips.includes(v))
                          .map((v) => (
                            <button key={v} type="button" onClick={() => addChip(v)} className="ml-1 font-mono text-sky-700 hover:underline">
                              ＋{v}
                            </button>
                          ))}
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-4 sm:px-5">
                    {nowhere ? (
                      <p className="text-sm text-slate-700">
                        五個站的正式站和測試站都找不到 {model} 的產品頁，SpecHub 也沒有這個型號。請確認型號拼寫；如果是還沒上市的新品，可能各站都還沒建立產品頁。
                      </p>
                    ) : (
                      <ModelCheckView baseline={entry.baseline} sites={states} onRetry={(site) => void retrySite(model, site)} />
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
