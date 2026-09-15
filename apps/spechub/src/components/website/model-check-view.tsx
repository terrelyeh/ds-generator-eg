"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FoundDatasheet, Row, SiteVerdict, SpecHubBaseline, Status } from "@/lib/website/compare";
import { LANGUAGE_LABEL } from "@/lib/website/compare";
import { SPECHUB_LANGUAGE, STATUS_LABEL, STATUS_TONE, type StatusTone } from "@/lib/website/labels";
import { SITE_CODES, type SiteCode } from "@/lib/website/sites";

/**
 * One model's datasheets across the five regional sites: SpecHub's versions,
 * a card per site, the detail table, and the issues to forward.
 *
 * Presentational only. The product page's 官網 tab and the 官網查詢 page both
 * own the fetching and pass each site's state in.
 */

export interface SiteState {
  site: SiteCode;
  verdict: SiteVerdict | null;
  checkedAt: string | null;
  loading: boolean;
  /** The request itself failed (network, 429, 500) — not a site that answered badly. */
  error: string | null;
  /** Changed in the check that just finished; highlighted once. */
  changed?: boolean;
}

const TONE_CLASS: Record<StatusTone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-700",
  muted: "border-slate-200 bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[5px] border px-1.5 py-0.5 text-[11px] font-medium leading-none ${TONE_CLASS[STATUS_TONE[status]]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso: string | null | undefined) => (iso ? dateFormat.format(new Date(iso)) : "—");
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFormat.format(new Date(iso)) : "—");

const versionOf = (d: FoundDatasheet | null) => (d ? d.versionField || d.fileVersion || "無版本" : "—");
const latestUpload = (row: Row) =>
  [row.production?.uploadedAt, row.staging?.uploadedAt].filter((v): v is string => Boolean(v)).sort().pop() ?? null;

function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500 motion-reduce:animate-none" aria-hidden />;
}

export function BaselineLine({ baseline }: { baseline: SpecHubBaseline | undefined }) {
  if (baseline === undefined) return null;
  if (baseline === null) {
    return <p className="text-xs text-slate-600">這個型號不在 SpecHub，沒有版號可以對照，只比較正式站和測試站。</p>;
  }
  const entries = (Object.keys(SPECHUB_LANGUAGE) as (keyof typeof SPECHUB_LANGUAGE)[]).filter((l) => baseline[l]);
  if (!entries.length) return <p className="text-xs text-slate-600">SpecHub 還沒有這個型號的 PDF，只比較正式站和測試站。</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <span>對照 SpecHub 目前版本</span>
      {entries.map((language) => (
        <span key={language} className="rounded-[5px] border border-slate-300 bg-white px-1.5 py-0.5 text-slate-600">
          {SPECHUB_LANGUAGE[language]} <span className="font-semibold tabular-nums text-slate-900">v{baseline[language]!.version}</span>
        </span>
      ))}
    </div>
  );
}

function SiteCards({ sites }: { sites: SiteState[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {sites.map((s) => (
        <div key={s.site} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-wide text-slate-900">{s.site}</span>
            {s.loading ? <Spinner /> : s.error ? <StatusBadge status="fail" /> : s.verdict ? <StatusBadge status={s.verdict.status} /> : null}
          </div>
          <span className="truncate text-[11px] text-slate-600">
            {s.loading ? "讀取中…" : s.error ? "查詢失敗" : s.verdict?.summary ?? "還沒查過"}
          </span>
        </div>
      ))}
    </div>
  );
}

function SiteRows({ state, onRetry }: { state: SiteState; onRetry?: (site: SiteCode) => void }) {
  const { site, verdict } = state;
  const group = "border-t-2 border-slate-400";
  const siteCell = (span: number) => (
    <td rowSpan={span} className={`${group} whitespace-nowrap px-3 py-2.5 align-top text-xs font-semibold tracking-wide text-slate-900`}>
      {site}
    </td>
  );
  const note = (content: React.ReactNode) => (
    <tr className={state.changed ? "bg-sky-50/60" : undefined}>
      {siteCell(1)}
      <td colSpan={6} className={`${group} px-3 py-2.5 text-sm text-slate-600`}>
        {content}
      </td>
    </tr>
  );

  if (state.loading && !verdict) return note(<span className="inline-flex items-center gap-2"><Spinner />讀取中…</span>);
  const failure = state.error ?? (verdict?.status === "fail" ? verdict.issues[0]?.replace(`${site}：`, "") ?? "查詢失敗" : null);
  if (failure) {
    return note(
      <span className="flex flex-wrap items-center gap-3">
        <StatusBadge status="fail" />
        <span className="text-red-700">{failure}</span>
        {onRetry && (
          <Button size="sm" variant="outline" className="h-7" onClick={() => onRetry(site)}>
            重試 {site}
          </Button>
        )}
      </span>,
    );
  }
  if (!verdict) return note(<span className="text-slate-500">還沒查過</span>);
  if (verdict.status === "nopage") return note(<span className="flex items-center gap-2"><StatusBadge status="nopage" />這一站沒有這個型號的產品頁，可能這一區沒有銷售。</span>);

  const lines: (Row | SiteVerdict["missing"][number])[] = [...verdict.missing, ...verdict.rows];
  if (!lines.length) return note(<span className="text-slate-500">產品頁上沒有 Datasheet</span>);

  return (
    <>
      {lines.map((line, index) => {
        const first = index === 0;
        const cell = `px-3 py-2.5 align-top ${first ? group : "border-t border-slate-200"}`;
        const highlight = state.changed ? "bg-sky-50/60" : undefined;
        if (!("fileId" in line)) {
          return (
            <tr key={`missing-${line.language}`} className={highlight}>
              {first && siteCell(lines.length)}
              <td className={cell}>
                <span className="text-sm text-slate-500">沒有{LANGUAGE_LABEL[line.language]} Datasheet</span>
              </td>
              <td className={`${cell} text-slate-400`}>—</td>
              <td className={`${cell} text-slate-400`}>—</td>
              <td className={cell}>
                <StatusBadge status={line.status} />
                <span className="mt-1 block text-[11px] leading-snug text-slate-600">{line.why}</span>
              </td>
              <td className={`${cell} text-slate-400`}>—</td>
              <td className={`${cell} text-slate-400`}>—</td>
            </tr>
          );
        }
        const scope = { single: "單台", series: "系列", platform: "平台", other_model: "其他型號" }[line.scope];
        const onPage = line.production?.onPage ?? line.staging?.onPage ?? false;
        const fileUrl = line.production?.url ?? line.staging?.url ?? null;
        return (
          <tr key={line.fileId} className={highlight}>
            {first && siteCell(lines.length)}
            <td className={cell}>
              <span className="flex flex-wrap gap-1">
                <span className="rounded-[5px] border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600">{scope}</span>
                <span className="rounded-[5px] border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600">{LANGUAGE_LABEL[line.language]}</span>
              </span>
              {fileUrl ? (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block break-all font-mono text-[11.5px] text-slate-800 hover:text-sky-700 hover:underline"
                >
                  {line.filename}
                </a>
              ) : (
                <span className="mt-1 block break-all font-mono text-[11.5px] text-slate-800">{line.filename}</span>
              )}
            </td>
            <td className={`${cell} whitespace-nowrap tabular-nums`}>{versionOf(line.production)}</td>
            <td className={`${cell} whitespace-nowrap tabular-nums`}>
              {line.staging && line.production && versionOf(line.staging) !== versionOf(line.production) ? (
                <b className="font-semibold">{versionOf(line.staging)}</b>
              ) : (
                versionOf(line.staging)
              )}
            </td>
            <td className={cell}>
              <StatusBadge status={line.status} />
              {line.why && <span className="mt-1 block text-[11px] leading-snug text-slate-600">{line.why}</span>}
            </td>
            <td className={`${cell} whitespace-nowrap text-sm ${onPage ? "text-slate-700" : "font-medium text-amber-800"}`}>{onPage ? "顯示" : "未顯示"}</td>
            <td className={`${cell} whitespace-nowrap text-sm tabular-nums text-slate-700`}>{formatDate(latestUpload(line))}</td>
          </tr>
        );
      })}
    </>
  );
}

export function IssueList({ issues, title }: { issues: string[]; title?: string }) {
  if (!issues.length) {
    return <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ 沒有發現問題</div>;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(issues.join("\n"));
      toast.success(`已複製 ${issues.length} 件事`);
    } catch {
      toast.error("瀏覽器不允許複製，請手動選取文字");
    }
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-400">
      <div className="flex items-center justify-between gap-3 border-b-2 border-slate-300 bg-slate-100 px-3 py-2">
        <span className="text-sm font-semibold text-slate-800">{title ?? `${issues.length} 件事要處理`}</span>
        <Button size="sm" variant="outline" className="h-7 bg-white" onClick={copy}>
          複製給行銷
        </Button>
      </div>
      <ol className="list-decimal space-y-1.5 bg-white py-2.5 pl-8 pr-3 text-sm text-slate-800">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ol>
    </div>
  );
}

export function ModelCheckView({
  baseline,
  sites,
  onRetry,
}: {
  baseline: SpecHubBaseline | undefined;
  sites: SiteState[];
  onRetry?: (site: SiteCode) => void;
}) {
  const ordered = SITE_CODES.map((code) => sites.find((s) => s.site === code) ?? { site: code, verdict: null, checkedAt: null, loading: false, error: null });
  const issues = ordered.flatMap((s) => s.verdict?.issues ?? []).filter((issue) => !issue.includes("查詢失敗"));
  const busy = ordered.some((s) => s.loading);
  // "No problems" is a claim about sites that were read. Never-checked isn't that.
  const anyChecked = ordered.some((s) => s.verdict);
  return (
    <div className="flex flex-col gap-4">
      <BaselineLine baseline={baseline} />
      <SiteCards sites={ordered} />
      <div className="overflow-x-auto rounded-lg border border-slate-400 bg-white">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-100 text-left text-xs font-semibold whitespace-nowrap text-slate-700">
              <th className="px-3 py-2.5">站台</th>
              <th className="px-3 py-2.5">Datasheet（類型 · 語言 · 檔名）</th>
              <th className="px-3 py-2.5">正式站</th>
              <th className="px-3 py-2.5">測試站</th>
              <th className="px-3 py-2.5">{baseline ? "對照 SpecHub" : "正式站 vs 測試站"}</th>
              <th className="px-3 py-2.5">產品頁</th>
              <th className="px-3 py-2.5">最後上傳</th>
            </tr>
          </thead>
          <tbody className="[&>tr:first-child>td]:border-t-0">
            {ordered.map((state) => (
              <SiteRows key={state.site} state={state} onRetry={onRetry} />
            ))}
          </tbody>
        </table>
      </div>
      {!busy && anyChecked && <IssueList issues={issues} />}
    </div>
  );
}
