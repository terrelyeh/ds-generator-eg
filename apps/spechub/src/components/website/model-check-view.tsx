"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FoundDatasheet, Row, SiteVerdict, SpecHubBaseline, Status } from "@/lib/website/compare";
import { LANGUAGE_LABEL } from "@/lib/website/compare";
import { SPECHUB_LANGUAGE, STATUS_LABEL, STATUS_TONE, type StatusTone } from "@/lib/website/labels";
import { SITE_CODES, SITE_LANGUAGES, type SiteCode } from "@/lib/website/sites";
import { SiteLabel } from "./badges";

/**
 * One model's datasheets across the five regional sites: SpecHub's versions,
 * a card per site, the detail table, and the issues to forward.
 *
 * Presentational only. The product page's 官網 tab and the 官網查詢 page both
 * own the fetching and pass each site's state in.
 *
 * Type hierarchy, shared with 依站台: the site (or model) a row belongs to is
 * the largest, boldest text; versions and status come next; file names, dates
 * and explanations are small and grey. Rows that can't change the verdict
 * (系列 sheets, 不比對) are dimmed so the eye lands on the ones that can.
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

const TONE_CLASS: Record<Exclude<StatusTone, "good" | "muted">, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-700",
};

/**
 * Only statuses that need someone get a filled chip; 已是最新 / 一致 / 不比對 are
 * plain text, so a column of twenty-six rows shows its three problems at once.
 * The quiet ones keep the chip's height (py-1 = its padding plus border).
 */
export function StatusBadge({ status }: { status: Status }) {
  const tone = STATUS_TONE[status];
  if (tone === "good") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap py-1 text-xs font-semibold leading-none text-emerald-700">
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M2.5 6.5 5 9l4.5-6" />
        </svg>
        {STATUS_LABEL[status]}
      </span>
    );
  }
  if (tone === "muted") {
    return <span className="inline-flex whitespace-nowrap py-1 text-xs font-medium leading-none text-slate-500">{STATUS_LABEL[status]}</span>;
  }
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-[5px] border px-2 py-[3px] text-xs font-semibold leading-none ${TONE_CLASS[tone]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Nothing for anyone to do — rendered quieter than the statuses that need someone. */
export const isCalm = (status: Status) => STATUS_TONE[status] === "good" || STATUS_TONE[status] === "muted";

/** "英文", or "繁中／英文" for TW. */
export const siteLanguageLabel = (site: SiteCode) => SITE_LANGUAGES[site].map((l) => LANGUAGE_LABEL[l]).join("／");

/** Bolds what an issue line is about — "EU", "ECW536 EU", "推送前先處理" — so a long list can be scanned. */
export function IssueText({ text }: { text: string }) {
  const at = text.indexOf("：");
  if (at <= 0 || at > 24) return <>{text}</>;
  return (
    <>
      <b className="font-semibold text-slate-900">{text.slice(0, at)}</b>
      {text.slice(at)}
    </>
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
    return <p className="text-[13px] text-slate-600">這個型號不在 SpecHub，沒有版號可以對照，只比較正式站和測試站。</p>;
  }
  const entries = (Object.keys(SPECHUB_LANGUAGE) as (keyof typeof SPECHUB_LANGUAGE)[]).filter((l) => baseline[l]);
  if (!entries.length) return <p className="text-[13px] text-slate-600">SpecHub 還沒有這個型號的 PDF，只比較正式站和測試站。</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
      <span>對照 SpecHub 目前版本</span>
      {entries.map((language) => (
        <span key={language} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-slate-600">
          {SPECHUB_LANGUAGE[language]} <span className="font-semibold tabular-nums text-slate-900">v{baseline[language]!.version}</span>
        </span>
      ))}
    </div>
  );
}

function SiteCards({ sites }: { sites: SiteState[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      {sites.map((s) => {
        const summary = s.loading ? "讀取中…" : s.error ? "查詢失敗" : s.verdict?.summary ?? "還沒查過";
        const calm = !s.error && (!s.verdict || isCalm(s.verdict.status));
        return (
          <div key={s.site} className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <SiteLabel site={s.site} className="text-base leading-none" />
              {s.loading ? <Spinner /> : s.error ? <StatusBadge status="fail" /> : s.verdict ? <StatusBadge status={s.verdict.status} /> : null}
            </div>
            <span title={summary} className={`truncate text-xs ${calm ? "text-slate-500" : "font-medium text-slate-800"}`}>
              {summary}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SiteRows({ state, onRetry }: { state: SiteState; onRetry?: (site: SiteCode) => void }) {
  const { site, verdict } = state;
  const group = "border-t-2 border-slate-400";
  const siteCell = (span: number) => (
    <td rowSpan={span} className={`${group} whitespace-nowrap border-r border-slate-200 bg-slate-50 px-4 py-3 align-top`}>
      <SiteLabel site={site} className="text-lg leading-tight" />
      <span className="mt-0.5 block text-xs text-slate-500">{siteLanguageLabel(site)}</span>
    </td>
  );
  const note = (content: React.ReactNode) => (
    <tr className={state.changed ? "bg-sky-50/60" : undefined}>
      {siteCell(1)}
      <td colSpan={6} className={`${group} px-3 py-3 text-sm text-slate-600`}>
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
        const cell = `px-3 py-3 align-top ${first ? group : "border-t border-slate-300"}`;
        const highlight = state.changed ? "bg-sky-50/60" : undefined;
        if (!("fileId" in line)) {
          return (
            <tr key={`missing-${line.language}`} className={highlight}>
              {first && siteCell(lines.length)}
              <td className={cell}>
                <span className="text-sm font-medium text-slate-800">沒有{LANGUAGE_LABEL[line.language]} Datasheet</span>
              </td>
              <td className={`${cell} text-slate-500`}>—</td>
              <td className={`${cell} text-slate-500`}>—</td>
              <td className={cell}>
                <StatusBadge status={line.status} />
                <span className="mt-1.5 block text-xs leading-snug text-slate-600">{line.why}</span>
              </td>
              <td className={`${cell} text-slate-500`}>—</td>
              <td className={`${cell} text-slate-500`}>—</td>
            </tr>
          );
        }
        const scope = { single: "單台", series: "系列", platform: "平台", other_model: "其他型號" }[line.scope];
        const onPage = line.production?.onPage ?? line.staging?.onPage ?? false;
        const fileUrl = line.production?.url ?? line.staging?.url ?? null;
        // A series or platform sheet is listed for completeness but never decides the site's status.
        const dim = line.status === "skip";
        const version = `whitespace-nowrap text-[15px] tabular-nums ${dim ? "text-slate-500" : "font-semibold text-slate-900"}`;
        return (
          <tr key={line.fileId} className={highlight}>
            {first && siteCell(lines.length)}
            <td className={cell}>
              <span className="block text-xs text-slate-500">
                {scope} · {LANGUAGE_LABEL[line.language]}
              </span>
              {fileUrl ? (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-0.5 block break-all font-mono text-[12.5px] hover:text-sky-700 hover:underline ${dim ? "text-slate-500" : "text-slate-700"}`}
                >
                  {line.filename}
                </a>
              ) : (
                <span className={`mt-0.5 block break-all font-mono text-[12.5px] ${dim ? "text-slate-500" : "text-slate-700"}`}>{line.filename}</span>
              )}
            </td>
            <td className={`${cell} ${version}`}>{versionOf(line.production)}</td>
            <td className={`${cell} ${version}`}>
              {line.staging && line.production && versionOf(line.staging) !== versionOf(line.production) ? (
                <b className="font-bold text-sky-700">{versionOf(line.staging)}</b>
              ) : (
                versionOf(line.staging)
              )}
            </td>
            <td className={cell}>
              <StatusBadge status={line.status} />
              {line.why && <span className="mt-1.5 block text-xs leading-snug text-slate-600">{line.why}</span>}
            </td>
            <td className={`${cell} whitespace-nowrap text-[13px] ${onPage ? "text-slate-600" : "font-semibold text-amber-800"}`}>{onPage ? "顯示" : "未顯示"}</td>
            <td className={`${cell} whitespace-nowrap text-[13px] tabular-nums text-slate-600`}>{formatDate(latestUpload(line))}</td>
          </tr>
        );
      })}
    </>
  );
}

export function IssueList({
  issues,
  title,
  noun = "件事要處理",
  subject,
  checkedAt,
  failedSites = [],
}: {
  issues: string[];
  title?: string;
  /** What the count counts, e.g. "件與 SpecHub 不同". */
  noun?: string;
  /**
   * What the list is about — the model, normally. It goes in the FIRST LINE OF
   * THE COPIED TEXT: marketing reads this in a chat message with none of the
   * page around it, and every line starts with a site, so without a subject
   * the paste says which sites are wrong about nothing in particular.
   */
  subject?: string;
  checkedAt?: string | null;
  failedSites?: string[];
}) {
  if (!issues.length) {
    // A site that couldn't be read is not a site without problems.
    return failedSites.length ? (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        其他站沒有發現問題，但 {failedSites.join("、")} 查詢失敗，那一站的狀況還不知道，請重試。
      </div>
    ) : (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ 沒有發現問題</div>
    );
  }
  async function copy() {
    const header = [
      subject ? `【${subject}】` : "",
      `官網 datasheet 待處理 ${issues.length} 件`,
      checkedAt ? `· ${formatDateTime(checkedAt)} 查詢` : "",
    ].filter(Boolean).join(" ");
    const numbered = issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n");
    try {
      await navigator.clipboard.writeText(`${header}\n${numbered}`);
      toast.success(`已複製 ${issues.length} 件事`);
    } catch {
      toast.error("瀏覽器不允許複製，請手動選取文字");
    }
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-400">
      <div className="flex items-center justify-between gap-3 border-b-2 border-slate-300 bg-slate-100 px-4 py-2.5">
        <span className="text-[15px] font-bold text-slate-900">{title ?? `${issues.length} ${noun}`}</span>
        <Button size="sm" variant="outline" className="h-7 bg-white" onClick={copy}>
          複製給行銷
        </Button>
      </div>
      <ol className="list-decimal space-y-2 bg-white py-3 pl-9 pr-4 text-sm leading-relaxed text-slate-700 marker:text-slate-500">
        {issues.map((issue) => (
          <li key={issue}>
            <IssueText text={issue} />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ModelCheckView({
  baseline,
  sites,
  model,
  onRetry,
  showCards = true,
  issuesNoun,
}: {
  baseline: SpecHubBaseline | undefined;
  sites: SiteState[];
  /** The model this view is about — copied into the issue list's first line. */
  model?: string;
  onRetry?: (site: SiteCode) => void;
  /** The product page's 官網 tab already shows every site above, so its detail view leaves the cards out. */
  showCards?: boolean;
  /**
   * What the issue count counts. The 官網 tab's own banner counts sites for the
   * versions marked 可上架; this list counts every difference from SpecHub, so
   * in that context it says so rather than showing a second, larger
   * "N 件事要處理" next to the first.
   */
  issuesNoun?: string;
}) {
  const ordered = SITE_CODES.map((code) => sites.find((s) => s.site === code) ?? { site: code, verdict: null, checkedAt: null, loading: false, error: null });
  const issues = ordered.flatMap((s) => s.verdict?.issues ?? []).filter((issue) => !issue.includes("查詢失敗"));
  const busy = ordered.some((s) => s.loading);
  // "No problems" is a claim about sites that were read. Never-checked isn't that.
  const anyChecked = ordered.some((s) => s.verdict);
  return (
    <div className="flex flex-col gap-4">
      <BaselineLine baseline={baseline} />
      {showCards && <SiteCards sites={ordered} />}
      <div className="overflow-x-auto rounded-lg border border-slate-400 bg-white">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-100 text-left text-[13px] font-semibold whitespace-nowrap text-slate-700">
              <th className="border-r border-slate-200 px-4 py-2.5">站台</th>
              <th className="px-3 py-2.5">Datasheet</th>
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
      {!busy && anyChecked && (
        <IssueList
          issues={issues}
          subject={model}
          checkedAt={ordered.map((s) => s.checkedAt).filter(Boolean).sort().pop() ?? null}
          noun={issuesNoun}
          failedSites={ordered.filter((s) => s.error || s.verdict?.status === "fail").map((s) => s.site)}
        />
      )}
    </div>
  );
}
