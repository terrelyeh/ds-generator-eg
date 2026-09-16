"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { SiteVerdict, SpecHubBaseline } from "@/lib/website/compare";
import type { LanguageState, SiteState as PushState } from "@/lib/website/model-state";
import { parseVersion, type DocLanguage } from "@/lib/website/parse";
import { languageVerdict, monthDay, needsAction, sitesByLanguage, stageOf, type MarkLocale } from "@/lib/website/reminders";
import { SITE_CODES, type SiteCode } from "@/lib/website/sites";
import { GlobeIcon, LANGUAGE_NAME, LanguageBadge, pushText, SiteLabel, TagIcon } from "./badges";
import { formatDateTime, ModelCheckView, StatusBadge, type SiteState } from "./model-check-view";

/**
 * The product page's 官網 tab: each SpecHub language version, its 可上架
 * mark, and the sites that version goes to.
 *
 * Every site publishes one language for a model, so the tab is one block,
 * 語言版本 → 上架的站台, and each site appears exactly once. The line at the
 * top says what needs doing for marked versions; unmarked ones are shown but
 * never counted. File-level detail sits folded underneath.
 *
 * Opens on the last saved check — the weekday daily check keeps it fresh —
 * and 重新查詢 re-reads the five sites in parallel.
 */

interface SavedSite {
  site: SiteCode;
  checkedAt: string;
  verdict: SiteVerdict;
  baseline: SpecHubBaseline;
}

interface CheckResponse {
  productId: string | null;
  baseline: SpecHubBaseline;
  languages: LanguageState[];
  siteState: Partial<Record<SiteCode, PushState>>;
  canMark: boolean;
  sites: SavedSite[];
  error?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const empty = (): Record<SiteCode, SiteState> =>
  Object.fromEntries(SITE_CODES.map((site) => [site, { site, verdict: null, checkedAt: null, loading: false, error: null }])) as Record<SiteCode, SiteState>;
const sameVersion = (a: string, b: string) => String(parseVersion(a)) === String(parseVersion(b));

/** Versions the saved checks were judged against that are no longer what SpecHub would judge against now. */
function baselineMoved(saved: SpecHubBaseline, current: SpecHubBaseline): string[] {
  if (!saved || !current) return [];
  return (["en", "ja", "zh"] as const)
    .filter((l) => current[l] && current[l]!.version !== saved[l]?.version)
    .map((l) => `${{ en: "英文", ja: "日文", zh: "繁中" }[l]} v${current[l]!.version}`);
}

interface Tile {
  site: SiteCode;
  node: React.ReactNode;
  note: string;
  push: string | null;
  needs: boolean;
}

export function WebsiteTab({ model, onCount }: { model: string; onCount?: (count: number) => void }) {
  const [sites, setSites] = useState<Record<SiteCode, SiteState>>(empty);
  const [data, setData] = useState<Omit<CheckResponse, "sites"> | null>(null);
  const [savedBaselines, setSavedBaselines] = useState<SpecHubBaseline[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [marking, setMarking] = useState<MarkLocale | null>(null);
  const previous = useRef<Record<SiteCode, SiteState>>(empty());

  const load = useCallback(async () => {
    const res = await fetch(`/api/website/check?model=${encodeURIComponent(model)}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as CheckResponse | null;
    if (!res.ok || !body) {
      toast.error(body?.error ?? "讀不到上次的查詢結果");
      setLoaded(true);
      return;
    }
    const { sites: saved, ...rest } = body;
    setData(rest);
    setSavedBaselines(saved.map((s) => s.baseline));
    setSites((current) => {
      const next = { ...current };
      for (const s of saved) next[s.site] = { site: s.site, verdict: s.verdict, checkedAt: s.checkedAt, loading: false, error: null };
      return next;
    });
    setLoaded(true);
  }, [model]);

  useEffect(() => {
    void load();
  }, [load]);

  const checkSite = useCallback(
    async (site: SiteCode) => {
      setSites((current) => ({ ...current, [site]: { ...current[site], loading: true, error: null, changed: false } }));
      try {
        const res = await fetch("/api/website/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, site }),
        });
        const body = (await res.json().catch(() => null)) as { checkedAt: string; verdict: SiteVerdict; baseline: SpecHubBaseline; error?: string } | null;
        if (!res.ok || !body?.verdict) throw new Error(body?.error ?? `HTTP ${res.status}`);
        setData((current) => (current ? { ...current, baseline: body.baseline } : current));
        setSites((current) => {
          const before = previous.current[site].verdict;
          const changed = Boolean(before && (before.status !== body.verdict.status || before.summary !== body.verdict.summary));
          return { ...current, [site]: { site, verdict: body.verdict, checkedAt: body.checkedAt, loading: false, error: null, changed } };
        });
        return body.verdict;
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
    if (failed) toast.warning(`查詢完成，但有 ${failed} 站查詢失敗，可以只重試那一站`);
    else toast.success("查詢完成");
  }

  async function mark(locale: MarkLocale, decision: "ready" | "skip" | "clear") {
    if (!data?.productId) return;
    setMarking(locale);
    try {
      const res = await fetch("/api/website/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: [{ productId: data.productId, locale, decision }] }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      const state = data.languages.find((l) => l.locale === locale);
      const label = state ? `${LANGUAGE_NAME[state.language]} v${state.latest.version}` : locale;
      toast.success(
        decision === "ready" ? `已標記 ${label} 可上架，下一次每日檢查開始提醒` : decision === "skip" ? `${label} 標為不上架，不會提醒` : "已取消標記",
      );
      await load();
    } catch (error) {
      toast.error(`標記失敗：${(error as Error).message}`);
    } finally {
      setMarking(null);
    }
  }

  const states = SITE_CODES.map((code) => sites[code]);
  const busy = states.some((s) => s.loading);
  const checkedTimes = states.map((s) => s.checkedAt).filter((t): t is string => Boolean(t)).sort();
  const oldest = checkedTimes[0] ?? null;
  const newest = checkedTimes[checkedTimes.length - 1] ?? null;
  const stale = oldest ? Date.now() - new Date(oldest).getTime() > DAY_MS : false;
  const moved = [...new Set(savedBaselines.flatMap((saved) => baselineMoved(saved, data?.baseline ?? null)))];

  const languages = data?.languages ?? [];
  const { groups, others } = sitesByLanguage(new Set(languages.map((l) => l.language)));

  const tileFor = (site: SiteCode, language: DocLanguage | null, state: LanguageState | null): Tile => {
    const saved = sites[site];
    const push = pushText(data?.siteState[site]);
    if (saved.loading) {
      return {
        site,
        node: <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500 motion-reduce:animate-none" aria-hidden />,
        note: "讀取中…",
        push: null,
        needs: false,
      };
    }
    if (saved.error) return { site, node: <StatusBadge status="fail" />, note: saved.error, push: null, needs: false };
    if (!saved.verdict) return { site, node: <span className="py-1 text-xs text-slate-500">還沒查過</span>, note: "按「重新查詢」讀取這一站", push, needs: false };
    if (!language) return { site, node: <StatusBadge status={saved.verdict.status} />, note: saved.verdict.summary, push, needs: false };

    const verdict = languageVerdict(saved.verdict, language);
    const status = verdict?.status ?? saved.verdict.status;
    const why = verdict?.why || saved.verdict.summary;
    if (state?.mark?.decision !== "ready") {
      const skipped = state?.mark?.decision === "skip" && sameVersion(state.mark.version, state.latest.version);
      return { site, node: <span className="py-1 text-xs font-medium text-slate-500">{skipped ? "不上架" : "未標記"}</span>, note: `${why} · 不會提醒`, push, needs: false };
    }
    const needs = needsAction(stageOf(status));
    return { site, node: <StatusBadge status={status} />, note: why, push: needs ? push : null, needs };
  };

  const rows = groups.map(({ language, sites: codes }) => {
    const state = languages.find((l) => l.language === language) ?? null;
    return { language, state, tiles: codes.map((site) => tileFor(site, language, state)) };
  });
  const otherTiles = others.map((site) => tileFor(site, null, null));
  const needs = rows.flatMap((r) => r.tiles).filter((t) => t.needs);
  const hasReady = languages.some((l) => l.mark?.decision === "ready");

  useEffect(() => {
    if (loaded && !busy) onCount?.(needs.length);
  }, [loaded, busy, needs.length, onCount]);

  return (
    <div className="rounded-xl bg-slate-100 p-3 sm:p-4">
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-50 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-[17px] font-bold text-slate-900">官網 Datasheet</h2>
            <p className="text-xs text-slate-600">
              {busy ? (
                "正在讀取五個站的正式站和測試站…"
              ) : newest ? (
                <>
                  每個工作日 09:30 自動檢查 ·{" "}
                  <span className={stale ? "font-medium text-amber-800" : undefined}>
                    上次 {formatDateTime(newest)}
                    {stale && `（${Math.floor((Date.now() - new Date(oldest!).getTime()) / DAY_MS)} 天前）`}
                  </span>
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

        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          {!loaded ? (
            <p className="text-sm text-slate-500">讀取上次的查詢結果…</p>
          ) : !newest && !busy ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <h3 className="text-[15px] font-semibold text-slate-900">還沒查過 {model} 在官網的狀況</h3>
              <p className="max-w-md text-sm text-slate-600">
                會讀取 EU、JP、TW、APAC、IN 五個官網的正式站和測試站，對照 SpecHub 的版本。只讀取，不會修改網站，大約需要十幾秒。
              </p>
              <Button onClick={checkAll}>查詢五個官網</Button>
            </div>
          ) : (
            <>
              {moved.length > 0 && !busy && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  上次查詢之後，要比對的版本變了（{moved.join("、")}），這份結果可能已經過時，建議重新查詢。
                </p>
              )}

              {!busy &&
                (needs.length ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm">
                    <b className="font-bold text-amber-800">{needs.length} 件事要處理</b>
                    {needs.map((t) => (
                      <span key={t.site} className="inline-flex items-center gap-1.5">
                        <SiteLabel site={t.site} className="text-sm" />
                        {t.node}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
                    {hasReady ? "✓ 標記可上架的版本都已上線" : "還沒有標記可上架的版本。標記之後，每日檢查才會追蹤並提醒。"}
                  </div>
                ))}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-600">
                <h3 className="mr-2 text-[15px] font-bold text-slate-900">語言版本 → 上架的站台</h3>
                <span className="inline-flex items-center gap-1.5">
                  <LanguageBadge language="en" size="sm" />
                  語言版本：SpecHub 產出的 PDF，在這裡標記可上架
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <GlobeIcon />
                  站台：這一版要上的官網
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-400">
                {rows.map(({ language, state, tiles }) => (
                  <FlowRow
                    key={language}
                    left={
                      <>
                        <div className="flex items-center gap-2.5">
                          <LanguageBadge language={language} />
                          <div className="leading-tight">
                            <div className="text-[13px] text-slate-600">
                              {LANGUAGE_NAME[language]}
                              {state?.latest.generatedAt ? ` · ${monthDay(state.latest.generatedAt)} 產出` : ""}
                            </div>
                            <div className="text-xl font-bold tabular-nums text-slate-900">v{state?.latest.version}</div>
                          </div>
                        </div>
                        {state && (
                          <MarkControls
                            state={state}
                            canMark={Boolean(data?.canMark && data.productId)}
                            busy={marking === state.locale}
                            onMark={(decision) => void mark(state.locale, decision)}
                          />
                        )}
                      </>
                    }
                    tiles={tiles}
                  />
                ))}
                {otherTiles.length > 0 && (
                  <FlowRow
                    left={
                      <p className="text-[13px] text-slate-600">
                        {languages.length ? "SpecHub 沒有這些站的語言版本" : "SpecHub 還沒有這個型號的 PDF"}
                        <span className="mt-1 block text-xs text-slate-500">只比對正式站和測試站，不會提醒</span>
                      </p>
                    }
                    tiles={otherTiles}
                    arrow={false}
                  />
                )}
              </div>

              <details className="rounded-lg border border-dashed border-slate-400 bg-slate-50 px-3.5 py-2.5">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">明細：各站的檔名、版本、上傳時間，以及要轉給各區的問題清單</summary>
                <div className="mt-3">
                  {/* The banner above counts sites for the versions marked 可上架;
                      this list counts every difference from SpecHub, so it must
                      not print a second, bigger "N 件事要處理" beside it. */}
                  <ModelCheckView
                    model={model}
                    baseline={data?.baseline}
                    sites={states}
                    onRetry={(site) => void checkSite(site)}
                    showCards={false}
                    issuesNoun="件與 SpecHub 不同"
                  />
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FlowRow({ left, tiles, arrow = true }: { left: React.ReactNode; tiles: Tile[]; arrow?: boolean }) {
  return (
    <div className="grid border-t border-slate-300 first:border-t-0 md:grid-cols-[minmax(230px,290px)_30px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-slate-50 px-4 py-3.5 md:border-b-0 md:border-r">{left}</div>
      <div className="hidden place-items-center text-slate-400 md:grid" aria-hidden>
        {arrow && (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 10h11M11 6l4 4-4 4" />
          </svg>
        )}
      </div>
      <div className="grid content-start gap-2.5 px-3.5 py-3 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] md:pl-0">
        {tiles.map((t) => (
          <div key={t.site} className={`flex flex-col gap-1.5 rounded-lg border bg-white px-3 py-2.5 ${t.needs ? "border-slate-400 shadow-sm" : "border-slate-300"}`}>
            <div className="flex items-center justify-between gap-2">
              <SiteLabel site={t.site} />
              {t.node}
            </div>
            <span className={`text-[12.5px] leading-snug ${t.needs ? "text-slate-800" : "text-slate-600"}`}>{t.note}</span>
            {t.push && <span className="text-[11.5px] text-slate-500">{t.push}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarkControls({
  state,
  canMark,
  busy,
  onMark,
}: {
  state: LanguageState;
  canMark: boolean;
  busy: boolean;
  onMark: (decision: "ready" | "skip" | "clear") => void;
}) {
  const { latest, mark } = state;
  const markLatest = (
    <span className="flex flex-wrap items-center gap-2.5">
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-sky-300 bg-white font-semibold text-sky-700 hover:bg-sky-50"
        disabled={busy}
        onClick={() => onMark("ready")}
      >
        <TagIcon />
        {mark?.decision === "ready" ? `標記 v${latest.version} 可上架` : "標記可上架"}
      </Button>
      {mark?.decision !== "ready" && (
        <button type="button" disabled={busy} onClick={() => onMark("skip")} className="text-xs text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-50">
          不上架
        </button>
      )}
    </span>
  );

  if (mark?.decision === "ready") {
    const same = sameVersion(mark.version, latest.version);
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-sky-700">
          <TagIcon />
          可上架{same ? "" : ` v${mark.version}`}
        </span>
        <span className="text-xs text-slate-500">
          {monthDay(mark.markedAt)} {mark.markedByName ?? ""} 標記
          {canMark && (
            <>
              {" · "}
              <button type="button" disabled={busy} onClick={() => onMark("clear")} className="hover:text-slate-900 hover:underline disabled:opacity-50">
                取消標記
              </button>
            </>
          )}
        </span>
        {mark.regenerated && <span className="text-xs font-semibold text-amber-700">標記後重產過，站上要換成新檔</span>}
        {!same && (
          <span className="mt-1 flex flex-col gap-1.5 text-xs text-slate-600">
            最新的 v{latest.version} 還沒標記，目前追蹤的是 v{mark.version}
            {canMark && latest.markable && markLatest}
          </span>
        )}
      </div>
    );
  }

  if (mark?.decision === "skip" && sameVersion(mark.version, latest.version)) {
    return (
      <span className="text-[13px] font-semibold text-slate-600">
        不上架
        {canMark && (
          <button type="button" disabled={busy} onClick={() => onMark("clear")} className="ml-2 text-xs font-normal text-slate-500 hover:text-slate-900 hover:underline disabled:opacity-50">
            取消
          </button>
        )}
      </span>
    );
  }

  if (!latest.markable) return <span className="text-xs text-slate-500">這一版不是 SpecHub 產生的，沒有 PDF 可以標記</span>;
  if (!canMark) return <span className="text-xs text-slate-500">未標記</span>;
  return markLatest;
}
