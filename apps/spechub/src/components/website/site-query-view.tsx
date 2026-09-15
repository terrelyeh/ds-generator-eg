"use client";

import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { GenerationFilter } from "@/lib/website/check";
import { LANGUAGE_LABEL, type Row, type SiteVerdict, type SpecHubBaseline } from "@/lib/website/compare";
import type { DocLanguage } from "@/lib/website/parse";
import { SITE_CODES, SITE_LANGUAGES, type SiteCode } from "@/lib/website/sites";
import { formatDate, formatDateTime, StatusBadge } from "./model-check-view";

/**
 * 官網查詢 · 依站台: every product in a category on the chosen sites.
 *
 * One site → a detail table (file, versions, upload date). Two or more → a
 * model × site matrix where each cell is a version, a status and one line of
 * time; clicking a cell opens that site's detail under the row, clicking a
 * model opens it in 依型號.
 */

interface CategoryOption {
  key: string;
  label: string;
  perSite: Partial<Record<SiteCode, number>>;
  total: number;
}

interface QueryModel {
  model: string;
  name: string;
  generation: string | null;
  generationUncertain: boolean;
  verdicts: Partial<Record<SiteCode, SiteVerdict>>;
  productModel: string | null;
  baseline: SpecHubBaseline;
}

interface QueryResult {
  sites: SiteCode[];
  category: string;
  generation: GenerationFilter | null;
  checkedAt: string;
  unknownGeneration: string[];
  models: QueryModel[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const monthDay = (iso: string | null | undefined) => (iso ? formatDate(iso).slice(5).replace("-", "/") : "");
const isApCategory = (key: string) => key.includes("access-point") || key.startsWith("wireless");
const versionOf = (d: Row["production"]) => (d ? d.versionField || d.fileVersion || "無版本" : "—");

/** The row that decided the site's status, else the first single-model sheet, else anything. */
function leadRow(verdict: SiteVerdict): Row | null {
  return (
    verdict.rows.find((r) => r.status === verdict.status && r.scope === "single") ??
    verdict.rows.find((r) => r.scope === "single") ??
    verdict.rows[0] ??
    null
  );
}

/** The language a site owes SpecHub for this model, when SpecHub has one. */
function siteLanguage(site: SiteCode, baseline: SpecHubBaseline): DocLanguage | null {
  return SITE_LANGUAGES[site].find((l) => baseline?.[l]) ?? null;
}

function timeLine(site: SiteCode, verdict: SiteVerdict, baseline: SpecHubBaseline): string {
  const row = leadRow(verdict);
  if (verdict.status === "push" && row?.staging?.uploadedAt) {
    return `測試站 ${monthDay(row.staging.uploadedAt)} 上傳 · 等 ${Math.max(0, Math.floor((Date.now() - new Date(row.staging.uploadedAt).getTime()) / DAY_MS))} 天`;
  }
  if (verdict.status === "todo") {
    const language = verdict.missing[0]?.language ?? row?.language ?? siteLanguage(site, baseline);
    const generated = language ? baseline?.[language]?.generatedAt : null;
    if (generated) return `落後 SpecHub ${Math.max(0, Math.floor((Date.now() - new Date(generated).getTime()) / DAY_MS))} 天`;
  }
  if (verdict.status === "prodnewer" && row?.production?.uploadedAt) return `正式站 ${monthDay(row.production.uploadedAt)} 上傳，測試站沒有`;
  const uploaded = row ? [row.production?.uploadedAt, row.staging?.uploadedAt].filter(Boolean).sort().pop() : null;
  return uploaded ? `${monthDay(uploaded)} 上傳` : "";
}

function specHubText(site: SiteCode, entry: QueryModel): { text: string; muted: boolean } {
  if (entry.baseline === null) return { text: "不在 SpecHub", muted: true };
  const language = siteLanguage(site, entry.baseline);
  if (!language) return { text: "沒有 PDF", muted: true };
  return { text: `${LANGUAGE_LABEL[language]} v${entry.baseline[language]!.version}`, muted: false };
}

/** Issues grouped by site, with a site's pending pushes folded into one line: one push publishes them all. */
function groupedIssues(result: QueryResult, models: QueryModel[]): [SiteCode, string[]][] {
  return result.sites
    .map((site): [SiteCode, string[]] => {
      const verdicts = models.map((m) => [m, m.verdicts[site]] as const).filter((pair): pair is readonly [QueryModel, SiteVerdict] => Boolean(pair[1]));
      const overwrite = verdicts.flatMap(([, v]) => v.issues.filter((i) => i.includes("下次推送會")).map((i) => `推送前先處理：${i.replace(`${site}：`, "")}`));
      const pushing = verdicts.filter(([, v]) => v.status === "push");
      const pushLine = pushing.length
        ? [`${site} 測試站有 ${pushing.length} 項 Datasheet 等推送（${pushing.map(([m, v]) => `${m.model} ${versionOf(leadRow(v)?.staging ?? null)}`).join("、")}），推送一次就會全部上線`]
        : [];
      const rest = verdicts.flatMap(([m, v]) =>
        v.issues
          .filter((i) => !i.includes("等推送") && !i.includes("下次推送會") && !i.includes("查詢失敗"))
          .map((i) => `${m.model}：${i.replace(`${site}：`, "")}`),
      );
      const failed = verdicts.find(([, v]) => v.status === "fail");
      return [site, [...(failed ? [`查詢失敗：${failed[1].issues[0]?.replace(`${site}：`, "") ?? ""}`] : []), ...overwrite, ...pushLine, ...rest]];
    })
    .filter(([, lines]) => lines.length);
}

function GroupedIssueList({ groups }: { groups: [SiteCode, string[]][] }) {
  const total = groups.reduce((sum, [, lines]) => sum + lines.length, 0);
  if (!total) return <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ 沒有發現問題</div>;
  async function copy() {
    const text = groups.map(([site, lines]) => [`【${site}】`, ...lines.map((line, i) => `${i + 1}. ${line}`)].join("\n")).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已複製 ${total} 件事`);
    } catch {
      toast.error("瀏覽器不允許複製，請手動選取文字");
    }
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-400">
      <div className="flex items-center justify-between gap-3 border-b-2 border-slate-300 bg-slate-100 px-3 py-2">
        <span className="text-sm font-semibold text-slate-800">{total} 件事要處理</span>
        <Button size="sm" variant="outline" className="h-7 bg-white" onClick={copy}>
          複製給行銷
        </Button>
      </div>
      <div className="bg-white py-1">
        {groups.map(([site, lines]) => (
          <div key={site}>
            <p className="px-3 pt-2.5 text-xs font-semibold tracking-wide text-slate-900">
              {site}（{lines.length}）
            </p>
            <ol className="list-decimal space-y-1.5 pb-2 pl-8 pr-3 pt-1 text-sm text-slate-800">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

function CellDetail({ site, verdict }: { site: SiteCode; verdict: SiteVerdict }) {
  const lines = [...verdict.missing.map((m) => ({ kind: "missing" as const, ...m })), ...verdict.rows.map((r) => ({ kind: "row" as const, ...r }))];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-slate-900">{site} 明細</p>
      {lines.length === 0 && <p className="text-sm text-slate-600">{verdict.summary}</p>}
      {lines.map((line) =>
        line.kind === "missing" ? (
          <p key={`m-${line.language}`} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <StatusBadge status={line.status} />沒有{LANGUAGE_LABEL[line.language]} Datasheet · {line.why}
          </p>
        ) : (
          <div key={line.fileId} className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <span className="break-all font-mono text-[11.5px] text-slate-800">
              {line.production?.url || line.staging?.url ? (
                <a href={line.production?.url ?? line.staging?.url ?? undefined} target="_blank" rel="noopener noreferrer" className="hover:text-sky-700 hover:underline">
                  {line.filename}
                </a>
              ) : (
                line.filename
              )}
            </span>
            <span className="whitespace-nowrap tabular-nums text-slate-700">正式站 {versionOf(line.production)} · {formatDate(line.production?.uploadedAt)}</span>
            <span className="whitespace-nowrap tabular-nums text-slate-700">測試站 {versionOf(line.staging)} · {formatDate(line.staging?.uploadedAt)}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={line.status} />
              <span className="text-[11px] text-slate-600">{line.why}</span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}

export function SiteQueryView({ onOpenModel }: { onOpenModel: (model: string) => void }) {
  const [sites, setSites] = useState<SiteCode[]>(["EU", "APAC", "IN"]);
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [generation, setGeneration] = useState<GenerationFilter | "all">("6");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "issue" | "none">("all");
  const [open, setOpen] = useState<{ model: string; site: SiteCode } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCategories(null);
    setCategoryError(null);
    fetch(`/api/website/categories?sites=${sites.join(",")}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { categories?: CategoryOption[]; errors?: Record<string, string>; error?: string } | null;
        if (!res.ok || !data?.categories) throw new Error(data?.error ?? `HTTP ${res.status}`);
        setCategories(data.categories);
        const failed = Object.entries(data.errors ?? {});
        if (failed.length) setCategoryError(`${failed.map(([s, e]) => `${s}（${e}）`).join("、")} 讀不到產品清單`);
        setCategory((current) =>
          data.categories!.some((c) => c.key === current)
            ? current
            : (data.categories!.find((c) => c.key.endsWith("indoor-access-points")) ?? data.categories!.find((c) => c.key === "wireless") ?? data.categories![0])?.key ?? "",
        );
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError") setCategoryError(`讀不到類別：${(error as Error).message}`);
      });
    return () => controller.abort();
  }, [sites]);

  const formKey = `${sites.join(",")}|${category}|${isApCategory(category) ? generation : "all"}`;
  const queriedKey = result ? `${result.sites.join(",")}|${result.category}|${result.generation ?? "all"}` : "";

  function toggleSite(site: SiteCode) {
    if (sites.includes(site) && sites.length === 1) {
      toast.info("至少要選一個站");
      return;
    }
    setSites(SITE_CODES.filter((code) => (code === site ? !sites.includes(site) : sites.includes(code))));
  }

  async function runQuery() {
    setLoading(true);
    setOpen(null);
    setFilter("all");
    try {
      const res = await fetch("/api/website/site-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites, category, generation: isApCategory(category) && generation !== "all" ? generation : null }),
      });
      const data = (await res.json().catch(() => null)) as (QueryResult & { error?: string }) | null;
      if (!res.ok || !data?.models) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setResult(data);
      toast.success(`查詢完成，共 ${data.models.length} 款`);
    } catch (error) {
      toast.error(`查詢失敗：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  const selectedCategory = categories?.find((c) => c.key === category);
  const models = result?.models ?? [];
  const hasIssue = (m: QueryModel) => result!.sites.some((s) => (m.verdicts[s]?.issues.length ?? 0) > 0);
  const noDatasheet = (m: QueryModel) =>
    result!.sites.some((s) => {
      const v = m.verdicts[s];
      return v && v.status !== "nopage" && v.rows.length === 0;
    });
  const visible = result ? models.filter((m) => filter === "all" || (filter === "issue" ? hasIssue(m) : noDatasheet(m))) : [];
  const groups = result ? groupedIssues(result, result.models) : [];
  const single = result?.sites.length === 1 ? result.sites[0] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)] sm:p-5">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600">站台（可複選）</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="站台">
              {SITE_CODES.map((site) => (
                <button
                  key={site}
                  type="button"
                  aria-pressed={sites.includes(site)}
                  onClick={() => toggleSite(site)}
                  className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    sites.includes(site) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {site}
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-w-[240px] flex-col gap-1.5">
            <label htmlFor="website-category" className="text-xs font-medium text-slate-600">
              類別
            </label>
            <select
              id="website-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!categories}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 disabled:opacity-60"
            >
              {!categories && <option>讀取各站的類別…</option>}
              {categories?.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                  {sites.length === 1 ? `（${c.total}）` : ""}
                </option>
              ))}
            </select>
          </div>
          {isApCategory(category) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-600">Wi-Fi 世代</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wi-Fi 世代">
                {(["7", "6E", "6", "5", "all"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={generation === g}
                    onClick={() => setGeneration(g)}
                    className={`h-9 rounded-lg border px-3 text-sm transition-colors ${
                      generation === g ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {g === "all" ? "全部" : g}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button onClick={runQuery} disabled={loading || !category} className="h-9">
            {loading ? "查詢中…" : "查詢"}
          </Button>
        </div>
        {isApCategory(category) && generation === "6" && <p className="mt-2 text-xs text-slate-500">選 6 會包含 6E。</p>}
        {sites.includes("JP") && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            JP 有一批舊產品頁的網址沒有類別（列在「舊產品頁」），用類別查詢會漏掉它們。要查特定型號，請改用「依型號」。
          </p>
        )}
        {categoryError && <p className="mt-3 text-sm text-red-700">{categoryError}</p>}
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-sm text-slate-600">
          正在讀取 {sites.join("、")} 的產品頁和 Datasheet，一整類產品大約要十幾到三十秒…
        </div>
      )}

      {result && !loading && (
        <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-300 bg-slate-50 px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold text-slate-900">
              {result.sites.join(" · ")} · {categories?.find((c) => c.key === result.category)?.label ?? result.category}
              {result.generation ? ` · Wi-Fi ${result.generation}` : ""}
            </h2>
            <span className="text-xs text-slate-600">查詢時間 {formatDateTime(result.checkedAt)} · 正式站＋測試站</span>
          </div>
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
            {formKey !== queriedKey && (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">條件已變更，按「查詢」更新結果。</p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
              {result.sites.map((site) => {
                const onSite = models.filter((m) => m.verdicts[site] && m.verdicts[site]!.status !== "nopage");
                const pushing = models.filter((m) => m.verdicts[site]?.status === "push").length;
                const issues = models.filter((m) => (m.verdicts[site]?.issues.length ?? 0) > 0 && m.verdicts[site]?.status !== "push").length;
                return (
                  <span key={site}>
                    <b className="font-semibold text-slate-900">{site}</b> {onSite.length} 款
                    {pushing > 0 && <> · <b className="font-semibold text-sky-700">{pushing}</b> 項待推送</>}
                    {issues > 0 && <> · <b className="font-semibold text-amber-800">{issues}</b> 款有狀況</>}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["all", "全部", models.length],
                ["issue", "有問題", models.filter(hasIssue).length],
                ["none", "沒有 Datasheet", models.filter(noDatasheet).length],
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

            <div className="overflow-x-auto rounded-lg border border-slate-400">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-left text-xs font-semibold whitespace-nowrap text-slate-700">
                    <th className="px-3 py-2.5">型號</th>
                    <th className="px-3 py-2.5">世代</th>
                    {single ? (
                      <>
                        <th className="px-3 py-2.5">Datasheet</th>
                        <th className="px-3 py-2.5">正式站</th>
                        <th className="px-3 py-2.5">測試站</th>
                        <th className="px-3 py-2.5">最後上傳</th>
                        <th className="px-3 py-2.5">狀態</th>
                        <th className="px-3 py-2.5">SpecHub</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2.5">SpecHub</th>
                        {result.sites.map((site) => (
                          <th key={site} className="px-3 py-2.5">
                            {site} <span className="font-normal text-slate-500">{SITE_LANGUAGES[site].map((l) => LANGUAGE_LABEL[l]).join("／")}</span>
                          </th>
                        ))}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={single ? 8 : 3 + result.sites.length} className="px-3 py-4 text-slate-500">
                        {models.length ? "沒有符合篩選的型號" : "選到的站沒有符合條件的產品頁"}
                      </td>
                    </tr>
                  )}
                  {visible.map((entry) => {
                    const modelCell = (
                      <td className="border-t border-slate-200 px-3 py-2.5 align-top">
                        <button type="button" onClick={() => onOpenModel(entry.model)} className="whitespace-nowrap font-medium text-slate-900 hover:text-sky-700 hover:underline">
                          {entry.model}
                        </button>
                        <span className="block text-[11px] text-slate-500">{entry.name}</span>
                      </td>
                    );
                    const generationCell = (
                      <td className="whitespace-nowrap border-t border-slate-200 px-3 py-2.5 align-top text-slate-700">
                        {entry.generation ?? "—"}
                        {entry.generationUncertain && <span title="從規格文字判斷，可能不準">?</span>}
                      </td>
                    );
                    if (single) {
                      const verdict = entry.verdicts[single]!;
                      const row = leadRow(verdict);
                      const hub = specHubText(single, entry);
                      return (
                        <tr key={entry.model}>
                          {modelCell}
                          {generationCell}
                          <td className="border-t border-slate-200 px-3 py-2.5 align-top">
                            {row ? (
                              <span className="break-all font-mono text-[11.5px] text-slate-800">{row.filename}</span>
                            ) : (
                              <span className="text-slate-500">{verdict.status === "nopage" ? "沒有產品頁" : "沒有 Datasheet"}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap border-t border-slate-200 px-3 py-2.5 align-top tabular-nums">{row ? versionOf(row.production) : "—"}</td>
                          <td className="whitespace-nowrap border-t border-slate-200 px-3 py-2.5 align-top tabular-nums">{row ? versionOf(row.staging) : "—"}</td>
                          <td className="whitespace-nowrap border-t border-slate-200 px-3 py-2.5 align-top tabular-nums text-slate-700">
                            {formatDate(row ? [row.production?.uploadedAt, row.staging?.uploadedAt].filter(Boolean).sort().pop() : null)}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-2.5 align-top">
                            <StatusBadge status={verdict.status} />
                            <span className="mt-1 block text-[11px] leading-snug text-slate-600">{row?.why ?? verdict.missing[0]?.why ?? verdict.summary}</span>
                          </td>
                          <td className={`whitespace-nowrap border-t border-slate-200 px-3 py-2.5 align-top ${hub.muted ? "text-slate-500" : "text-slate-800"}`}>{hub.text}</td>
                        </tr>
                      );
                    }
                    const expanded = open?.model === entry.model && result.sites.includes(open.site) ? open.site : null;
                    return (
                      <Fragment key={entry.model}>
                        <tr>
                          {modelCell}
                          {generationCell}
                          <td className="whitespace-nowrap border-t border-slate-200 px-3 py-2.5 align-top text-[12px] text-slate-700">
                            {entry.baseline === null ? (
                              <span className="text-slate-500">不在 SpecHub</span>
                            ) : Object.keys(entry.baseline).length === 0 ? (
                              <span className="text-slate-500">沒有 PDF</span>
                            ) : (
                              (Object.entries(entry.baseline) as [DocLanguage, { version: string }][]).map(([l, v]) => (
                                <span key={l} className="block tabular-nums">
                                  {LANGUAGE_LABEL[l]} v{v.version}
                                </span>
                              ))
                            )}
                          </td>
                          {result.sites.map((site) => {
                            const verdict = entry.verdicts[site];
                            if (!verdict || verdict.status === "nopage") {
                              return (
                                <td key={site} className="border-t border-slate-200 px-3 py-2.5 align-top text-xs text-slate-400">
                                  無產品頁
                                </td>
                              );
                            }
                            const row = leadRow(verdict);
                            const version =
                              verdict.status === "push" && row
                                ? `${versionOf(row.production)} → ${versionOf(row.staging)}`
                                : row
                                  ? versionOf(row.production ?? row.staging)
                                  : verdict.missing[0]
                                    ? `沒有${LANGUAGE_LABEL[verdict.missing[0].language]}版`
                                    : "沒有 Datasheet";
                            const isOpen = expanded === site;
                            return (
                              <td key={site} className="border-t border-slate-200 px-1.5 py-1.5 align-top">
                                <button
                                  type="button"
                                  aria-expanded={isOpen}
                                  onClick={() => setOpen(isOpen ? null : { model: entry.model, site })}
                                  className={`block w-full rounded-md px-1.5 py-1 text-left transition-colors ${isOpen ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-slate-50"}`}
                                >
                                  <span className="block whitespace-nowrap tabular-nums text-slate-900">
                                    {version}
                                    {row && row.scope !== "single" && <span className="ml-1 text-[11px] text-slate-500">系列</span>}
                                  </span>
                                  <span className="mt-1 block">
                                    <StatusBadge status={verdict.status} />
                                  </span>
                                  <span className="mt-1 block whitespace-nowrap text-[11px] text-slate-500">{timeLine(site, verdict, entry.baseline)}</span>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={3 + result.sites.length} className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                              <CellDetail site={expanded} verdict={entry.verdicts[expanded]!} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {result.unknownGeneration.length > 0 && (
              <details className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <summary className="cursor-pointer">另有 {result.unknownGeneration.length} 款 AP 看不出 Wi-Fi 世代，沒有列入</summary>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  這些產品頁沒有填世代欄位，名稱也看不出來（多半是舊款）。要查請用「依型號」：{result.unknownGeneration.join("、")}
                </p>
              </details>
            )}

            <GroupedIssueList groups={groups} />
          </div>
        </section>
      )}

      {!result && !loading && selectedCategory && (
        <p className="px-1 text-sm text-slate-500">選好站台和類別後按「查詢」。</p>
      )}
    </div>
  );
}
