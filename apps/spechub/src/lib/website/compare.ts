import {
  compareVersions,
  formatVersion,
  parseVersion,
  sameVersion,
  type DatasheetScope,
  type DocLanguage,
} from "./parse";
import { SITE_LANGUAGES, type SiteCode } from "./sites";

/**
 * What one model's datasheets look like on one site, judged against SpecHub.
 *
 * The rules, in the order they win:
 *  - production newer than staging → "prodnewer": the next push overwrites
 *    it, so it outranks everything else (production is overwritten with
 *    staging by hand, never edited on purpose)
 *  - SpecHub has this language:
 *      production has SpecHub's version → "ok", or "diff" when the file size
 *      differs from SpecHub's PDF (usually a copy from before a Regenerate)
 *      only staging has it → "push"
 *      either is newer than SpecHub → "newer"
 *      otherwise → "todo"
 *  - SpecHub doesn't: production vs staging only → "same" / "push" / "notyet" / "mismatch"
 *
 * Only single-model datasheets on the product page decide a status. Series
 * and platform sheets have their own version lines and are listed, not
 * compared. Languages stay separate: a Japanese v1.4 says nothing about the
 * English one.
 */

export type Status =
  | "ok" | "push" | "todo" | "diff" | "newer" | "prodnewer"
  | "same" | "notyet" | "mismatch" | "nopage" | "fail" | "skip" | "wrong_model";

/** Most urgent first — a site shows the first of these that applies. */
export const STATUS_PRIORITY: Status[] = [
  "fail", "prodnewer", "wrong_model", "diff", "todo", "push", "newer", "mismatch", "notyet", "ok", "same", "skip", "nopage",
];

export const LANGUAGE_LABEL: Record<DocLanguage, string> = { en: "英文", ja: "日文", zh: "繁中" };

/** One datasheet file on one site environment, already read by `parse.ts`. */
export interface FoundDatasheet {
  fileId: number;
  title: string;
  filename: string;
  language: DocLanguage;
  scope: DatasheetScope;
  otherModels: string[];
  versionField: string;
  fileVersion: string;
  status: string;
  onPage: boolean;
  /** Looks like a datasheet, but the type field says something else. */
  typeMismatch: boolean;
  filesize: number | null;
  uploadedAt: string | null;
  uploaderId: string | null;
  url: string | null;
}

export interface SiteSide {
  error: string | null;
  pageFound: boolean;
  datasheets: FoundDatasheet[];
}

export interface SpecHubVersion {
  version: string;
  generatedAt: string | null;
  /** Bytes of SpecHub's current PDF for this version, when it made one. */
  filesize: number | null;
}

/** Null when the model isn't in SpecHub at all. */
export type SpecHubBaseline = Partial<Record<DocLanguage, SpecHubVersion>> | null;

export interface Row {
  fileId: number;
  title: string;
  filename: string;
  language: DocLanguage;
  scope: DatasheetScope;
  otherModels: string[];
  production: FoundDatasheet | null;
  staging: FoundDatasheet | null;
  status: Status;
  why: string;
}

export interface SiteVerdict {
  site: SiteCode;
  status: Status;
  summary: string;
  rows: Row[];
  /** Expected languages with nothing on the site, e.g. TW has no Chinese sheet. */
  missing: { language: DocLanguage; status: Status; why: string }[];
  issues: string[];
}

const versionOf = (d: FoundDatasheet) => parseVersion(d.versionField) ?? parseVersion(d.fileVersion);
const shown = (d: FoundDatasheet | null) => (d ? d.versionField || d.fileVersion || "無版本" : "—");
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function newest(list: FoundDatasheet[]): FoundDatasheet | null {
  return list.reduce<FoundDatasheet | null>((best, d) => {
    const v = versionOf(d);
    if (!v) return best ?? d;
    const bv = best ? versionOf(best) : null;
    return !bv || compareVersions(v, bv) > 0 ? d : best;
  }, null);
}

const countsForStatus = (d: FoundDatasheet) => d.scope === "single" && d.onPage && d.status === "publish";

/** The verdict for one language, from the newest counting sheet on each side. */
export function judgeLanguage(
  production: FoundDatasheet | null,
  staging: FoundDatasheet | null,
  specHub: SpecHubVersion | null,
): { status: Status; why: string } {
  const pv = production ? versionOf(production) : null;
  const sv = staging ? versionOf(staging) : null;
  const newerOnStaging = () =>
    Boolean(production && staging && staging.uploadedAt && production.uploadedAt && staging.uploadedAt > production.uploadedAt);

  if (production && (!staging || (pv && sv && compareVersions(pv, sv) > 0))) {
    return {
      status: "prodnewer",
      why: staging
        ? `正式站 ${shown(production)} 比測試站 ${shown(staging)} 新，下次推送會被蓋掉`
        : "只有正式站有，下次推送會被蓋掉",
    };
  }

  if (specHub) {
    const target = parseVersion(specHub.version);
    const hub = `SpecHub ${formatVersion(target)}`;
    if (pv && target && compareVersions(pv, target) === 0) {
      const sizeDiffers = (d: FoundDatasheet | null) => Boolean(d?.filesize && specHub.filesize && d.filesize !== specHub.filesize);
      if (!sizeDiffers(production)) return { status: "ok", why: `跟 ${hub} 相同` };
      if (staging && sv && compareVersions(sv, target) === 0 && !sizeDiffers(staging) && newerOnStaging()) {
        return { status: "push", why: `測試站已換成 SpecHub 目前的檔案，正式站還是舊檔` };
      }
      return {
        status: "diff",
        why: `版號一樣，但站上 ${megabytes(production!.filesize!)}、SpecHub 目前這份 ${megabytes(specHub.filesize!)}`,
      };
    }
    if (sv && target && compareVersions(sv, target) === 0) {
      return { status: "push", why: `測試站已是 ${formatVersion(sv)}，正式站${production ? `還是 ${shown(production)}` : "還沒有"}` };
    }
    if (target && ((pv && compareVersions(pv, target) > 0) || (sv && compareVersions(sv, target) > 0))) {
      return { status: "newer", why: `站上是 ${formatVersion(sv && (!pv || compareVersions(sv, pv) > 0) ? sv : pv)}，比 ${hub} 新` };
    }
    return {
      status: "todo",
      why: production || staging ? `站上是 ${shown(production ?? staging)}，${hub} 已經出了` : `站上沒有，${hub} 已經出了`,
    };
  }

  if (!production && !staging) return { status: "notyet", why: "正式站、測試站都沒有" };
  if (production && staging && pv && sv && compareVersions(pv, sv) === 0) {
    return newerOnStaging()
      ? { status: "push", why: "測試站換過檔案，正式站還是舊的" }
      : { status: "same", why: "正式站和測試站相同" };
  }
  if (staging && (!production || (pv && sv && compareVersions(sv, pv) > 0))) {
    return { status: "push", why: `測試站已是 ${shown(staging)}，正式站${production ? `還是 ${shown(production)}` : "還沒有"}` };
  }
  return { status: "mismatch", why: "正式站和測試站的檔案不同，看不出哪邊較新" };
}

/** Pair each file across environments. Staging overwrites production, so a pushed file keeps its id on both. */
function pairRows(production: SiteSide, staging: SiteSide): Pick<Row, "fileId" | "production" | "staging">[] {
  const byId = new Map<number, Pick<Row, "fileId" | "production" | "staging">>();
  for (const d of production.datasheets) byId.set(d.fileId, { fileId: d.fileId, production: d, staging: null });
  for (const d of staging.datasheets) {
    const existing = byId.get(d.fileId);
    if (existing) existing.staging = d;
    else byId.set(d.fileId, { fileId: d.fileId, production: null, staging: d });
  }
  return [...byId.values()];
}

export function judgeSite(
  site: SiteCode,
  model: string,
  production: SiteSide,
  staging: SiteSide,
  specHub: SpecHubBaseline,
): SiteVerdict {
  const at = `${site}：`;
  if (production.error || staging.error) {
    const reason = production.error ?? staging.error ?? "";
    return { site, status: "fail", summary: "查詢失敗", rows: [], missing: [], issues: [`${at}查詢失敗（${reason}）`], };
  }
  if (!production.pageFound && !staging.pageFound) {
    return { site, status: "nopage", summary: "沒有產品頁", rows: [], missing: [], issues: [] };
  }

  const issues: string[] = [];
  const expected = SITE_LANGUAGES[site];
  const languageStatus = new Map<DocLanguage, { status: Status; why: string }>();
  const missing: SiteVerdict["missing"] = [];

  // A site owes SpecHub one language, not all of them: TW takes Chinese and
  // falls back to English, so a TW page with a Chinese sheet isn't "missing"
  // the English one. Other accepted languages are judged only when present.
  const primary = expected.find((l) => specHub?.[l]);
  const languages = new Set<DocLanguage>([
    ...production.datasheets.map((d) => d.language),
    ...staging.datasheets.map((d) => d.language),
    ...(primary ? [primary] : []),
  ]);
  for (const language of languages) {
    if (!expected.includes(language)) continue;
    const prod = newest(production.datasheets.filter((d) => d.language === language && countsForStatus(d)));
    const stg = newest(staging.datasheets.filter((d) => d.language === language && countsForStatus(d)));
    const hub = specHub?.[language] ?? null;
    if (!prod && !stg && !hub) continue;
    const verdict = judgeLanguage(prod, stg, hub);
    const seriesOnly = !prod && !stg && [...production.datasheets, ...staging.datasheets].some(
      (d) => d.language === language && d.onPage && (d.scope === "series" || d.scope === "platform"),
    );
    const final = seriesOnly && verdict.status === "todo"
      ? { status: "todo" as Status, why: `只有系列 Datasheet，SpecHub 已有單台 ${formatVersion(parseVersion(hub!.version))}` }
      : verdict;
    languageStatus.set(language, final);
    if (!prod && !stg) missing.push({ language, ...final });

    const label = LANGUAGE_LABEL[language];
    const hubVersion = hub ? formatVersion(parseVersion(hub.version)) : "";
    switch (final.status) {
      case "todo":
        issues.push(prod || stg
          ? `${at}${label}版還是 ${shown(prod ?? stg)}，SpecHub 已經是 ${hubVersion}，測試站也還沒更新`
          : seriesOnly
            ? `${at}產品頁只有系列 Datasheet，SpecHub 已有${label}單台 ${hubVersion}`
            : `${at}正式站、測試站都沒有 ${model} 的${label} Datasheet，SpecHub 已有 ${hubVersion}`);
        break;
      case "push":
        issues.push(`${at}測試站已是${label} ${shown(stg)}，正式站${prod ? `還是 ${shown(prod)}` : "還沒有"}，等推送`);
        break;
      case "diff": {
        const sizes = `站上 ${megabytes(prod!.filesize!)}，SpecHub ${megabytes(hub!.filesize!)}`;
        const uploaded = prod!.uploadedAt?.slice(0, 10);
        const generated = hub!.generatedAt?.slice(0, 10);
        issues.push(uploaded && generated && prod!.uploadedAt! < hub!.generatedAt!
          ? `${at}${label} ${shown(prod)} 還是舊檔：站上這份 ${uploaded} 上傳，比 SpecHub ${generated} 產生這一版還早（${sizes}）`
          : `${at}${label} ${shown(prod)} 的檔案跟 SpecHub 目前那份不同（${sizes}），請確認上傳的是 SpecHub 目前這份`);
        break;
      }
      case "prodnewer":
        issues.push(stg
          ? `${at}正式站是${label} ${shown(prod)}，測試站還是 ${shown(stg)}。下次推送會蓋回 ${shown(stg)}，推送前要先補傳到測試站`
          : `${at}${label} ${shown(prod)} 只在正式站，下次推送會被蓋掉，推送前要先補傳到測試站`);
        break;
      case "newer":
        issues.push(`${at}站上的${label}版比 SpecHub 的 ${hubVersion} 還新（${final.why}）`);
        break;
      case "mismatch":
        issues.push(`${at}${label}版在正式站和測試站的檔案不同，看不出哪邊較新`);
        break;
      case "notyet":
        break;
    }
  }

  const rows: Row[] = pairRows(production, staging).map(({ fileId, production: p, staging: s }) => {
    const d = (p ?? s)!;
    let status: Status;
    let why: string;
    if (d.scope === "other_model") {
      status = "wrong_model";
      why = `這份是 ${d.otherModels.join("、")} 的 Datasheet`;
    } else if (d.scope !== "single") {
      status = "skip";
      why = d.scope === "platform" ? "平台 datasheet 的版號獨立" : "系列 datasheet 的版號獨立";
    } else if (!expected.includes(d.language)) {
      status = "skip";
      why = `這站不放${LANGUAGE_LABEL[d.language]}版，不比對`;
    } else {
      const lang = languageStatus.get(d.language);
      status = lang?.status ?? "skip";
      why = lang?.why ?? "";
    }
    return { fileId, title: d.title, filename: d.filename, language: d.language, scope: d.scope, otherModels: d.otherModels, production: p, staging: s, status, why };
  });

  for (const row of rows) {
    const d = (row.production ?? row.staging)!;
    const onEither = Boolean(row.production?.onPage || row.staging?.onPage);
    if (row.status === "wrong_model" && onEither) issues.push(`${at}產品頁掛的是其他型號的 Datasheet（${row.otherModels.join("、")}：${d.filename}）`);
    for (const side of [row.production, row.staging]) {
      if (!side) continue;
      if (side.versionField && side.fileVersion && !sameVersion(side.versionField, side.fileVersion)) {
        issues.push(`${at}${side.filename} 的版本欄位是 ${side.versionField}，但檔名是 ${side.fileVersion}`);
        break;
      }
      if (!side.versionField && side.scope === "single") {
        issues.push(`${at}${side.filename} 的版本欄位空白`);
        break;
      }
    }
    if (d.typeMismatch && onEither) issues.push(`${at}${d.filename} 的類型沒有設成 Data Sheet`);
    if (!onEither && d.scope === "single" && d.status === "publish") issues.push(`${at}已上傳 ${d.filename}，但產品頁沒有顯示`);
  }

  for (const [label, side] of [["正式站", production], ["測試站", staging]] as const) {
    const singles = side.datasheets.filter(countsForStatus);
    for (const language of new Set(singles.map((d) => d.language))) {
      const same = singles.filter((d) => d.language === language);
      if (same.length > 1) {
        issues.push(`${at}${label}產品頁同時顯示 ${same.length} 份${LANGUAGE_LABEL[language]}單台 Datasheet（${same.map(shown).join("、")}）`);
      }
    }
  }
  if (!production.pageFound && staging.pageFound) issues.push(`${at}產品頁只在測試站，等推送`);
  if (!rows.length && !missing.length) issues.push(`${at}產品頁沒有 Datasheet（正式站、測試站都沒有）`);

  const statuses = [...languageStatus.values()].map((v) => v.status).concat(rows.map((r) => r.status));
  if (!production.pageFound && staging.pageFound) statuses.push("push");
  const status = STATUS_PRIORITY.find((s) => statuses.includes(s)) ?? (rows.length ? "skip" : "notyet");

  return { site, status, summary: summarize(status, languageStatus, rows), rows, missing, issues: [...new Set(issues)] };
}

function summarize(status: Status, languages: Map<DocLanguage, { status: Status; why: string }>, rows: Row[]): string {
  const lead = [...languages.entries()].find(([, v]) => v.status === status);
  if (lead) {
    const [language] = lead;
    const row = rows.find((r) => r.language === language && r.scope === "single");
    const label = LANGUAGE_LABEL[language];
    if (!row) return status === "todo" ? `沒有${label} Datasheet` : label;
    if (status === "push") return `測試站 ${shown(row.staging)}`;
    if (status === "diff") return `${label} ${shown(row.production)} 檔案不同`;
    return `${label} ${shown(row.production ?? row.staging)}`;
  }
  if (!rows.length) return "沒有 Datasheet";
  if (status === "wrong_model") return "掛錯型號";
  return "只有系列或平台";
}
