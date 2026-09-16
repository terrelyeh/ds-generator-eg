import { LANGUAGE_LABEL, type SiteVerdict, type Status } from "./compare";
import { formatVersion, parseVersion, type DocLanguage } from "./parse";
import { SITE_CODES, SITE_LANGUAGES, type SiteCode } from "./sites";

/**
 * 官網 Datasheet 1b: what the 可上架 marks mean on each site, and the two
 * Telegram digests built from them. Pure — the daily cron, the 官網 tab and
 * the 上架追蹤 tab all read their state through these.
 *
 * A mark is per language version, not per site. Each site publishes exactly
 * one language for a model (EU/APAC/IN English, JP Japanese, TW Chinese and
 * English when there is no Chinese), so a language version maps to a fixed
 * set of sites and every site appears under exactly one language.
 */

export const LOCALE_LANGUAGE = { en: "en", ja: "ja", "zh-TW": "zh" } as const satisfies Record<string, DocLanguage>;
export type MarkLocale = keyof typeof LOCALE_LANGUAGE;
export const MARK_LOCALES = Object.keys(LOCALE_LANGUAGE) as MarkLocale[];
export const LANGUAGE_LOCALE: Record<DocLanguage, MarkLocale> = { en: "en", ja: "ja", zh: "zh-TW" };

export type MarkDecision = "ready" | "skip";

export interface Mark {
  locale: MarkLocale;
  decision: MarkDecision;
  version: string;
  /** The PDF generation the mark was made against. */
  generatedAt: string | null;
  markedAt: string;
  markedBy: string | null;
}

/** The language a site takes for this model: the first of its languages that SpecHub has a version of. */
export function siteLanguage(site: SiteCode, available: ReadonlySet<DocLanguage>): DocLanguage | null {
  return SITE_LANGUAGES[site].find((language) => available.has(language)) ?? null;
}

/** Sites grouped under the language each takes; `others` take none SpecHub has. */
export function sitesByLanguage(available: ReadonlySet<DocLanguage>): { groups: { language: DocLanguage; sites: SiteCode[] }[]; others: SiteCode[] } {
  const groups = new Map<DocLanguage, SiteCode[]>();
  const others: SiteCode[] = [];
  for (const site of SITE_CODES) {
    const language = siteLanguage(site, available);
    if (!language) others.push(site);
    else groups.set(language, [...(groups.get(language) ?? []), site]);
  }
  const order: DocLanguage[] = ["en", "ja", "zh"];
  return { groups: order.filter((l) => groups.has(l)).map((language) => ({ language, sites: groups.get(language)! })), others };
}

/** One language's verdict on one site. Falls back to rows and missing for checks saved before `languages` existed. */
export function languageVerdict(verdict: SiteVerdict | null | undefined, language: DocLanguage): { status: Status; why: string } | null {
  if (!verdict) return null;
  if (verdict.status === "fail" || verdict.status === "nopage") return { status: verdict.status, why: verdict.summary };
  const direct = verdict.languages?.[language];
  if (direct) return direct;
  const missing = verdict.missing.find((m) => m.language === language);
  if (missing) return { status: missing.status, why: missing.why };
  const row = verdict.rows.find((r) => r.language === language && r.scope === "single");
  return row ? { status: row.status, why: row.why } : null;
}

/**
 * Who has to act next:
 *   live   — production has this version (or a newer one)
 *   push   — staging has it; waiting for the person who pushes
 *   upload — not on the site yet; marketing uploads it to staging
 *   fix    — something to redo first: an old file under this version number,
 *            a production-only copy the next push will wipe, conflicting files
 *   nopage — the site has no product page for this model; not tracked
 *   unknown — the site couldn't be read, or was never checked
 */
export type Stage = "live" | "push" | "upload" | "fix" | "nopage" | "unknown";

export function stageOf(status: Status | null | undefined): Stage {
  switch (status) {
    case "ok":
    case "newer":
    case "same":
      return "live";
    case "push":
      return "push";
    case "todo":
    case "notyet":
      return "upload";
    case "diff":
    case "prodnewer":
    case "mismatch":
    case "wrong_model":
      return "fix";
    case "nopage":
      return "nopage";
    default:
      return "unknown";
  }
}

/** Stages that put something on someone's list. */
export const needsAction = (stage: Stage) => stage === "push" || stage === "upload" || stage === "fix";

export interface SavedCheck {
  verdict: SiteVerdict;
  checkedAt: string;
}

export interface TrackedSite {
  site: SiteCode;
  stage: Stage;
  status: Status | null;
  why: string;
  checkedAt: string | null;
}

export interface TrackedVersion {
  model: string;
  language: DocLanguage;
  version: string;
  markedAt: string;
  /** The same version was regenerated after it was marked, so the sites need the new file. */
  regenerated: boolean;
  sites: TrackedSite[];
}

/** Where a ready-marked language version stands on each site that takes that language. */
export function trackVersion(input: {
  model: string;
  mark: Mark;
  /** generated_at of the marked version's PDF now. */
  currentGeneratedAt: string | null;
  available: ReadonlySet<DocLanguage>;
  checks: Partial<Record<SiteCode, SavedCheck>>;
}): TrackedVersion {
  const language = LOCALE_LANGUAGE[input.mark.locale];
  const sites = SITE_CODES.filter((site) => siteLanguage(site, input.available) === language).map((site): TrackedSite => {
    const check = input.checks[site];
    const verdict = languageVerdict(check?.verdict, language);
    return { site, stage: stageOf(verdict?.status), status: verdict?.status ?? null, why: verdict?.why ?? "還沒查過", checkedAt: check?.checkedAt ?? null };
  });
  const regenerated = Boolean(
    input.mark.generatedAt && input.currentGeneratedAt && new Date(input.currentGeneratedAt).getTime() > new Date(input.mark.generatedAt).getTime(),
  );
  return { model: input.model, language, version: input.mark.version, markedAt: input.mark.markedAt, regenerated, sites };
}

// ---------------------------------------------------------------- latest versions nobody has decided on

export interface UnmarkedVersion {
  productId: string;
  model: string;
  locale: MarkLocale;
  version: string;
  generatedAt: string;
}

/**
 * Latest language versions of active products, generated more than `minDays`
 * ago, that have neither a 可上架 nor a 不上架 mark for that version. Adding
 * marks turns "forgot to upload" into "forgot to mark"; this is what catches
 * the second one.
 *
 * Only versions SpecHub generated count — a number detected from Drive has no
 * PDF here to put on a site.
 */
export function unmarkedLatest(
  products: { id: string; model_name: string; status: string | null; current_versions: Record<string, string> | null }[],
  versions: { product_id: string; locale: string | null; version: string; generated_at: string }[],
  marks: { product_id: string; locale: string; version: string }[],
  now: Date,
  minDays = 7,
): UnmarkedVersion[] {
  const cutoff = now.getTime() - minDays * 24 * 60 * 60 * 1000;
  const out: UnmarkedVersion[] = [];
  for (const product of products) {
    if (product.status !== "active") continue;
    for (const locale of MARK_LOCALES) {
      const current = product.current_versions?.[locale];
      if (!current) continue;
      const row = versions.find(
        (v) => v.product_id === product.id && (v.locale ?? "en") === locale && sameVersionText(v.version, current),
      );
      if (!row || new Date(row.generated_at).getTime() > cutoff) continue;
      const decided = marks.some((m) => m.product_id === product.id && m.locale === locale && sameVersionText(m.version, current));
      if (!decided) out.push({ productId: product.id, model: product.model_name, locale, version: current, generatedAt: row.generated_at });
    }
  }
  return out.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
}

function sameVersionText(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  return Boolean(pa && pb && pa.length === pb.length && pa.every((n, i) => n === pb[i]));
}

// ---------------------------------------------------------------- pushes

export interface SiteStateRow {
  checked_at: string;
  production_modified: string | null;
  last_push_at: string | null;
  push_detected: boolean;
}

/**
 * Production only changes when someone pushes staging over it, so the newest
 * content on production moving forward is a push. It happened after the
 * previous check and after the newest content it brought; the later of the
 * two is the date shown ("約 9/15"). Until a move is seen, the newest content
 * on production is only a lower bound ("9/11 之後").
 */
export function nextPushState(
  previous: SiteStateRow | null,
  current: { productionModified: string | null; checkedAt: string },
): { lastPushAt: string | null; pushDetected: boolean } {
  if (!previous?.production_modified) return { lastPushAt: current.productionModified, pushDetected: false };
  if (current.productionModified && new Date(current.productionModified).getTime() > new Date(previous.production_modified).getTime()) {
    const after = [previous.checked_at, current.productionModified].sort().pop()!;
    return { lastPushAt: after, pushDetected: true };
  }
  return { lastPushAt: previous.last_push_at, pushDetected: previous.push_detected };
}

// ---------------------------------------------------------------- Telegram digests

export interface PendingPush {
  /** Model numbers named in the file, or its title when none are known. */
  label: string;
  language: DocLanguage;
  version: string;
  modifiedAt: string;
}

export interface PushBlocker {
  site: SiteCode;
  model: string;
  why: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TW_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });
const TW_WEEKDAY = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", weekday: "short" });
const TW_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit" });

export const monthDay = (iso: string) => TW_DATE.format(new Date(iso));
export const daysSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const heading = (title: string, now: Date, scope: string) =>
  `<b>${title}</b>\n${monthDay(now.toISOString())}（${TW_WEEKDAY.format(now).replace("週", "")}）${TW_TIME.format(now)} 檢查 · ${scope}`;

/** The pusher's message: sites not to push yet, then what each site's next push publishes. Null when there is nothing. */
export function buildPushDigest(input: {
  now: Date;
  blockers: PushBlocker[];
  pending: Partial<Record<SiteCode, PendingPush[]>>;
  lastPush: Partial<Record<SiteCode, { at: string | null; detected: boolean }>>;
}): string | null {
  const sitesWithPending = SITE_CODES.filter((site) => (input.pending[site]?.length ?? 0) > 0);
  if (!input.blockers.length && !sitesWithPending.length) return null;
  const parts = [heading("官網 Datasheet 推送提醒", input.now, "五個站")];

  const blockedSites = [...new Set(input.blockers.map((b) => b.site))];
  for (const site of blockedSites) {
    parts.push(`⚠️ <b>推 ${site} 之前先等一下</b>`);
    parts.push(input.blockers.filter((b) => b.site === site).map((b) => `・${escapeHtml(b.model)}：${escapeHtml(b.why)}`).join("\n"));
  }

  if (sitesWithPending.length) {
    parts.push("📤 <b>可以推送</b>");
    for (const site of sitesWithPending) {
      const push = input.lastPush[site];
      const since = push?.at ? `（上次推送${push.detected ? "約 " : " "}${monthDay(push.at)}${push.detected ? "" : " 之後"}）` : "";
      const lines = input.pending[site]!.map(
        (p) => `・${escapeHtml(p.label)} ${LANGUAGE_LABEL[p.language]} ${escapeHtml(p.version || "無版本")}，等了 ${daysSince(p.modifiedAt, input.now)} 天`,
      );
      parts.push(`<b>${site}</b>${since}\n${lines.join("\n")}`);
    }
  }
  const quiet = SITE_CODES.filter((site) => !sitesWithPending.includes(site) && !blockedSites.includes(site));
  if (quiet.length) parts.push(`${quiet.join("、")} 沒有待推送。`);
  return parts.join("\n\n");
}

/** Marketing's message: what to redo, what isn't on staging yet, old files, and the unmarked count. Null when there is nothing. */
export function buildMarketingDigest(input: {
  now: Date;
  tracked: TrackedVersion[];
  unmarkedCount: number;
  link: string | null;
}): string | null {
  type Line = { site: SiteCode; text: string };
  const reupload: Line[] = [];
  const notOnStaging: Line[] = [];
  const oldFiles: Line[] = [];
  const conflicts: Line[] = [];
  for (const entry of input.tracked) {
    const name = `${escapeHtml(entry.model)} ${LANGUAGE_LABEL[entry.language]} ${formatVersion(parseVersion(entry.version)) || escapeHtml(entry.version)}`;
    for (const site of entry.sites) {
      if (site.status === "prodnewer") reupload.push({ site: site.site, text: `${name} 只在正式站，下次推送會被蓋掉` });
      else if (site.stage === "upload") notOnStaging.push({ site: site.site, text: `${name}，標記後 ${daysSince(entry.markedAt, input.now)} 天` });
      else if (site.status === "diff") oldFiles.push({ site: site.site, text: `${name}${entry.regenerated ? "（標記後重產過）" : ""}：${escapeHtml(site.why)}` });
      else if (site.stage === "fix") conflicts.push({ site: site.site, text: `${name}：${escapeHtml(site.why)}` });
    }
  }
  if (!reupload.length && !notOnStaging.length && !oldFiles.length && !conflicts.length && !input.unmarkedCount) return null;

  const bySite = (lines: Line[]) =>
    SITE_CODES.filter((site) => lines.some((l) => l.site === site))
      .map((site) => {
        const mine = lines.filter((l) => l.site === site).map((l) => l.text);
        return mine.length === 1 ? `<b>${site}</b>・${mine[0]}` : `<b>${site}</b>\n${mine.map((t) => `・${t}`).join("\n")}`;
      })
      .join("\n");

  const parts = [heading("官網 Datasheet 待上架", input.now, "標記「可上架」的版本")];
  if (reupload.length) parts.push(`🔁 <b>先補傳到測試站</b>\n${bySite(reupload)}`);
  if (notOnStaging.length) parts.push(`⬆️ <b>還沒上測試站</b>\n${bySite(notOnStaging)}`);
  if (oldFiles.length) parts.push(`🔄 <b>站上是舊檔</b>\n${bySite(oldFiles)}`);
  if (conflicts.length) parts.push(`🧹 <b>站上的資料問題</b>\n${bySite(conflicts)}`);
  if (input.unmarkedCount) parts.push(`🏷️ <b>還沒標記</b>\n另有 ${input.unmarkedCount} 份最新版產出超過 7 天，還沒標記可上架或不上架。`);
  if (input.link) parts.push(`<a href="${input.link}">在 SpecHub 打開上架追蹤 ›</a>`);
  return parts.join("\n\n");
}

// ---------------------------------------------------------------- a version on its sites, in one line

const STAGE_PHRASE: Record<Stage, string> = {
  live: "已經是這一版",
  push: "測試站已上傳，等推送",
  upload: "還沒有",
  fix: "要處理",
  nopage: "沒有產品頁",
  unknown: "還沒查過",
};
const STAGE_ORDER: Stage[] = ["live", "push", "fix", "upload", "nopage", "unknown"];

/**
 * "EU、APAC、IN 已經是這一版" / "TW 已經是這一版；EU 還沒有" — for deciding
 * whether to mark a version: one already live everywhere is safe to mark.
 * `allLive` is true only when every site that takes the language has it.
 */
export function describeSites(sites: TrackedSite[]): { text: string; allLive: boolean } {
  if (!sites.length) return { text: "沒有站放這個語言", allLive: false };
  const parts = STAGE_ORDER.map((stage) => [stage, sites.filter((s) => s.stage === stage).map((s) => s.site)] as const)
    .filter(([, list]) => list.length)
    .map(([stage, list]) => `${list.join("、")} ${STAGE_PHRASE[stage]}`);
  return { text: parts.join("；"), allLive: sites.every((s) => s.stage === "live") };
}

/**
 * How many sites need something for a model's 可上架 versions — the number on
 * the product page's 官網 tab. Null when the model has never been checked.
 */
export function countTodo(input: {
  model: string;
  marks: Mark[];
  available: ReadonlySet<DocLanguage>;
  checks: Partial<Record<SiteCode, SavedCheck>>;
}): number | null {
  if (!Object.keys(input.checks).length) return null;
  return input.marks
    .filter((mark) => mark.decision === "ready")
    .flatMap((mark) => trackVersion({ model: input.model, mark, currentGeneratedAt: null, available: input.available, checks: input.checks }).sites)
    .filter((site) => needsAction(site.stage)).length;
}
