"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { SiteVerdict, SpecHubBaseline } from "@/lib/website/compare";
import { SITE_CODES, type SiteCode } from "@/lib/website/sites";
import { formatDateTime, ModelCheckView, type SiteState } from "./model-check-view";

/**
 * The product page's 官網 tab: where this model's datasheet stands on the
 * five regional sites.
 *
 * Opens on the last saved check and never queries the sites by itself — ten
 * WordPress sites take a few seconds. 重新查詢 checks the five sites in
 * parallel and fills each in as it answers.
 */

interface SavedSite {
  site: SiteCode;
  checkedAt: string;
  verdict: SiteVerdict;
  baseline: SpecHubBaseline;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const empty = (): Record<SiteCode, SiteState> =>
  Object.fromEntries(SITE_CODES.map((site) => [site, { site, verdict: null, checkedAt: null, loading: false, error: null }])) as Record<
    SiteCode,
    SiteState
  >;

/** SpecHub made a version after the check that is not what the check compared against. */
function baselineMoved(saved: SpecHubBaseline, current: SpecHubBaseline): string[] {
  if (!saved || !current) return [];
  return (["en", "ja", "zh"] as const)
    .filter((l) => current[l] && current[l]!.version !== saved[l]?.version)
    .map((l) => `${{ en: "英文", ja: "日文", zh: "繁中" }[l]} v${current[l]!.version}`);
}

export function WebsiteTab({ model, onIssueCount }: { model: string; onIssueCount?: (count: number) => void }) {
  const [sites, setSites] = useState<Record<SiteCode, SiteState>>(empty);
  const [baseline, setBaseline] = useState<SpecHubBaseline | undefined>(undefined);
  const [savedBaselines, setSavedBaselines] = useState<SpecHubBaseline[]>([]);
  const [loaded, setLoaded] = useState(false);
  const previous = useRef<Record<SiteCode, SiteState>>(empty());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/website/check?model=${encodeURIComponent(model)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { baseline: SpecHubBaseline; sites: SavedSite[]; error?: string } | null;
      if (cancelled) return;
      if (!res.ok || !data) {
        toast.error(data?.error ?? "讀不到上次的查詢結果");
        setLoaded(true);
        return;
      }
      setBaseline(data.baseline);
      setSavedBaselines(data.sites.map((s) => s.baseline));
      setSites((current) => {
        const next = { ...current };
        for (const s of data.sites) next[s.site] = { site: s.site, verdict: s.verdict, checkedAt: s.checkedAt, loading: false, error: null };
        return next;
      });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [model]);

  const checkSite = useCallback(
    async (site: SiteCode) => {
      setSites((current) => ({ ...current, [site]: { ...current[site], loading: true, error: null, changed: false } }));
      try {
        const res = await fetch("/api/website/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, site }),
        });
        const data = (await res.json().catch(() => null)) as { checkedAt: string; verdict: SiteVerdict; baseline: SpecHubBaseline; error?: string } | null;
        if (!res.ok || !data?.verdict) throw new Error(data?.error ?? `HTTP ${res.status}`);
        setBaseline(data.baseline);
        setSites((current) => {
          const before = previous.current[site].verdict;
          const changed = Boolean(before && (before.status !== data.verdict.status || before.summary !== data.verdict.summary));
          return { ...current, [site]: { site, verdict: data.verdict, checkedAt: data.checkedAt, loading: false, error: null, changed } };
        });
        return data.verdict;
      } catch (error) {
        const message = error instanceof Error ? error.message : "查詢失敗";
        setSites((current) => ({ ...current, [site]: { ...current[site], loading: false, error: message } }));
        return null;
      }
    },
    [model],
  );

  async function checkAll() {
    previous.current = sites;
    const verdicts = await Promise.all(SITE_CODES.map(checkSite));
    setSavedBaselines([]);
    const failed = verdicts.filter((v) => !v || v.status === "fail").length;
    const issues = verdicts.flatMap((v) => (v && v.status !== "fail" ? v.issues : [])).length;
    onIssueCount?.(issues);
    if (failed) toast.warning(`查詢完成，但有 ${failed} 站查詢失敗，可以只重試那一站`);
    else toast.success(issues ? `查詢完成，發現 ${issues} 件事要處理` : "查詢完成，沒有發現問題");
  }

  const states = SITE_CODES.map((code) => sites[code]);
  const busy = states.some((s) => s.loading);
  const checkedTimes = states.map((s) => s.checkedAt).filter((t): t is string => Boolean(t)).sort();
  const oldest = checkedTimes[0] ?? null;
  const newest = checkedTimes[checkedTimes.length - 1] ?? null;
  const stale = oldest ? Date.now() - new Date(oldest).getTime() > DAY_MS : false;
  const moved = [...new Set(savedBaselines.flatMap((saved) => baselineMoved(saved, baseline ?? null)))];

  return (
    <div className="rounded-xl bg-slate-100 p-3 sm:p-4">
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-50 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-base font-semibold text-slate-900">官網 Datasheet</h2>
            <p className="text-xs text-slate-600">
              {busy ? (
                "正在讀取五個站的正式站和測試站…"
              ) : newest ? (
                <>
                  <span className={stale ? "font-medium text-amber-800" : undefined}>
                    上次查詢 {formatDateTime(newest)}
                    {stale && `（${Math.floor((Date.now() - new Date(oldest!).getTime()) / DAY_MS)} 天前）`}
                  </span>
                  <span className="text-slate-400"> · </span>正式站＋測試站
                </>
              ) : (
                "只讀取官網的公開資料，不會修改網站"
              )}
            </p>
          </div>
          {(newest || busy) && (
            <Button onClick={checkAll} disabled={busy} variant="outline" className="bg-white">
              {busy ? "查詢中…" : "重新查詢"}
            </Button>
          )}
        </div>

        <div className="px-4 py-4 sm:px-5">
          {!loaded ? (
            <p className="text-sm text-slate-500">讀取上次的查詢結果…</p>
          ) : !newest && !busy ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <h3 className="text-[15px] font-semibold text-slate-900">還沒查過 {model} 在官網的狀況</h3>
              <p className="max-w-md text-sm text-slate-600">
                會讀取 EU、JP、TW、APAC、IN 五個官網的正式站和測試站，對照 SpecHub 目前的版本。只讀取，不會修改網站，大約需要十幾秒。
              </p>
              <Button onClick={checkAll}>查詢五個官網</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {moved.length > 0 && !busy && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  上次查詢之後，SpecHub 又產出了 {moved.join("、")}，這份結果可能已經過時，建議重新查詢。
                </p>
              )}
              <ModelCheckView baseline={baseline} sites={states} onRetry={(site) => void checkSite(site)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
