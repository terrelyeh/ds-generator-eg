/**
 * Reading datasheets off the regional WordPress sites: which file is a
 * datasheet, which model and language it is for, which version it claims.
 *
 * Ported from the offline `wp-ds-check` skill so both tools read a site the
 * same way. One deliberate difference, marked in `modelTokens`: a model whose
 * number contains another model's number (ECW201L-POE contains ECW201L) no
 * longer makes its own datasheet look like a series sheet.
 *
 * Everything here is pure: plain REST payloads in, plain records out.
 */

// ---------------------------------------------------------------- text

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

/** WordPress `title.rendered` escapes punctuation (`&#8211;`, `&amp;`). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const stripTags = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- versions

/** Dates that look like versions in file names: 03.08.2022, 2022-08-03, 20190418, 09092024, 240813. */
const DATE_PATTERN =
  /(?<!\d)\d{1,2}([._-])\d{1,2}\1(?:19|20)\d{2}(?!\d)|(?<!\d)(?:19|20)\d{2}([._-])\d{1,2}\2\d{1,2}(?!\d)|(?<!\d)(?:19|20)\d{6}(?!\d)|(?<!\d)\d{4}(?:19|20)\d{2}(?!\d)|(?<!\d)\d{6}(?!\d)/g;

/** The version a field or file name claims ("v1.2", "v20"), dates excluded. "" when there is none. */
export function versionText(text: string | null | undefined): string {
  if (!text) return "";
  const cleaned = text.replace(DATE_PATTERN, " ");
  const match =
    /(?<![A-Za-z])[vV]\s*(\d+(?:\.\d+)*)/.exec(cleaned) ?? /(?<![\d.])(\d+\.\d+(?:\.\d+)*)(?![\d.])/.exec(cleaned);
  return match ? `v${match[1]}` : "";
}

/** Numeric parts with trailing zeros dropped, so v1.0 equals v1. Null when there is no version. */
export function parseVersion(text: string | null | undefined): number[] | null {
  const raw = versionText(text);
  if (!raw) return null;
  const parts = raw.slice(1).split(".").map(Number);
  while (parts.length > 1 && parts[parts.length - 1] === 0) parts.pop();
  return parts;
}

export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** True when both name the same version, or either has none. Accepts the dotless form: v20 is v2.0. */
export function sameVersion(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb || compareVersions(pa, pb) === 0) return true;
  return versionText(a).slice(1).replace(/\./g, "") === versionText(b).slice(1).replace(/\./g, "");
}

export const formatVersion = (parts: number[] | null) =>
  parts ? `v${(parts.length > 1 ? parts : [...parts, 0]).join(".")}` : "";

// ---------------------------------------------------------------- language

export type DocLanguage = "en" | "ja" | "zh";

const LANGUAGE_FIELD: Record<string, DocLanguage> = {
  en: "en", ja: "ja", jp: "ja", zh: "zh", "zh-hant": "zh", "zh-tw": "zh", zh_tw: "zh", tw: "zh",
};

/** A language the text states outright (_ja, _JP, _zh, _EN, or kana). Null when it doesn't say. */
export function explicitLanguage(text: string | null | undefined): DocLanguage | null {
  if (!text) return null;
  if (/[぀-ヿ]/.test(text)) return "ja";
  const match = /(?:^|[_\s.-])(ja|jp|zh|tc|cn|en)(?=[_\s.-]|$)/i.exec(text);
  if (!match) return null;
  const code = match[1].toLowerCase();
  return code === "ja" || code === "jp" ? "ja" : code === "en" ? "en" : "zh";
}

/**
 * The file name wins over the title, and both win over the language field:
 * marketing fills the field in by hand and it is often wrong. English when
 * nothing says otherwise.
 */
export function languageOf(filename: string, title: string, field: string | null | undefined): DocLanguage {
  const stem = filename.replace(/\.[^.]+$/, "");
  return explicitLanguage(stem) ?? explicitLanguage(title) ?? LANGUAGE_FIELD[(field ?? "").toLowerCase()] ?? "en";
}

// ---------------------------------------------------------------- what a file is

const DATASHEET_NAME = /data\s*-?\s*t?sheet|データシート|(?<![A-Za-z])DS_/i;
const OTHER_DOCUMENT = /guide|manual|firmware|configuration|command|install|qsg|mib|brochure|booklet|white\s*-?\s*paper|release\s*note/i;
const PLATFORM_WORDS = /\bmanagement\b|管理平台|\bsolution\b|\bplatform\b|ezmaster|\bsight\b/i;

/** For files whose type isn't set to data-sheet: the name must say datasheet, and the file name must not be another document. */
export function looksLikeDatasheet(title: string, filename: string): boolean {
  return DATASHEET_NAME.test(`${title} ${filename}`) && !OTHER_DOCUMENT.test(filename);
}

/**
 * Known model numbers mentioned in the text. Only numbers the site actually
 * has product pages for count, so "IP66" or "R20" never reads as a model.
 *
 * Differs from the skill: when a whole hyphenated token is itself a known
 * model, its pieces are not counted. The skill also matched the prefix, so
 * ECW201L-POE's own datasheet looked like it covered ECW201L too and was
 * classed as a series sheet.
 */
export function modelTokens(text: string, known: ReadonlySet<string>): Set<string> {
  const found = new Set<string>();
  for (const raw of text.split(/[^A-Za-z0-9-]+/)) {
    const token = raw.replace(/^-+|-+$/g, "").toUpperCase();
    if (!token) continue;
    if (known.has(token)) {
      found.add(token);
      continue;
    }
    const parts = token.split("-");
    const candidates = new Set<string>(parts);
    for (let i = 1; i <= parts.length; i++) candidates.add(parts.slice(0, i).join("-"));
    for (let i = 0; i < parts.length; i++) candidates.add(parts.slice(i).join("-"));
    for (const candidate of candidates) if (known.has(candidate)) found.add(candidate);
  }
  return found;
}

export type DatasheetScope = "single" | "series" | "platform" | "other_model";

/** single: only this model · series: several models or none named · platform: a management platform · other_model: names other models only. */
export function scopeOf(
  model: string,
  title: string,
  filename: string,
  known: ReadonlySet<string>,
): { scope: DatasheetScope; otherModels: string[] } {
  const tokens = modelTokens(`${title} ${filename}`, known);
  if (tokens.has(model)) {
    const others = [...tokens].filter((t) => t !== model).sort();
    return { scope: others.length ? "series" : "single", otherModels: others };
  }
  if (tokens.size) return { scope: "other_model", otherModels: [...tokens].sort() };
  if (PLATFORM_WORDS.test(`${title} ${filename}`)) return { scope: "platform", otherModels: [] };
  return { scope: "series", otherModels: [] };
}

// ---------------------------------------------------------------- REST records

type Json = Record<string, unknown>;
const asObject = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const asString = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export interface WpFile {
  id: number;
  title: string;
  status: string;
  /** ACF `type` (data-sheet, quick-guide, firmware, …). */
  type: string;
  versionField: string;
  languageField: string;
  region: string;
  filename: string;
  /** Bytes, when the file is a WordPress attachment. */
  filesize: number | null;
  /** Later of the attachment's upload and replace times, ISO UTC. */
  uploadedAt: string | null;
  /** WordPress user id of the uploader. */
  uploaderId: string | null;
  url: string | null;
}

/** "2024-08-30 03:13:01" (GMT, as ACF returns attachment dates) → ISO. */
function gmtToIso(value: unknown): string | null {
  const text = asString(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(text)) return null;
  const date = new Date(`${text.replace(" ", "T").slice(0, 19)}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function fileFromRest(record: unknown): WpFile | null {
  const r = asObject(record);
  if (!r || typeof r.id !== "number") return null;
  const acf = asObject(r.acf) ?? {};
  const title = asObject(r.title);
  const attachment = asObject(acf.download_link);
  const external = asObject(acf.external_link);
  const externalUrl = asString(external?.url);
  const stamps = [gmtToIso(attachment?.date), gmtToIso(attachment?.modified)].filter((s): s is string => Boolean(s));
  const filesize = Number(attachment?.filesize);
  return {
    id: r.id,
    title: decodeEntities(asString(title?.raw) || asString(title?.rendered)).trim(),
    status: asString(r.status) || "publish",
    type: asString(acf.type),
    versionField: asString(acf.version).trim(),
    languageField: asString(acf.language),
    region: asString(acf.region),
    filename: asString(attachment?.filename) || asString(attachment?.title) || externalUrl.split("/").pop() || "",
    filesize: attachment && Number.isFinite(filesize) && filesize > 0 ? filesize : null,
    uploadedAt: stamps.length ? stamps.sort()[stamps.length - 1] : null,
    uploaderId: asString(attachment?.author) || null,
    url: asString(attachment?.url) || externalUrl || null,
  };
}

export interface WpProduct {
  id: number;
  model: string;
  /** URL category path (`access-point/indoor-access-point`), or `legacy/<type>` for old /product/ pages. */
  category: string;
  name: string;
  link: string;
  status: string;
  /** Ids of the files attached to the page's Downloads list, in page order. */
  fileIds: number[];
  technologies: string[];
  /** Description, highlights and spec text, for telling Wi-Fi generations apart. */
  text: string;
}

const idsOf = (value: unknown): number[] =>
  (Array.isArray(value) ? value : [])
    .map((item) => Number(asObject(item) ? (item as Json).ID ?? (item as Json).id : item))
    .filter((n) => Number.isInteger(n) && n > 0);

/**
 * The model comes from the page URL: `/products/<category>/<model>/`, or
 * `/product/<model>/` for older pages, which some sites (JP) still have.
 * Drafts have no model in the URL, so `model_number` is the fallback.
 */
export function productFromRest(record: unknown): WpProduct | null {
  const r = asObject(record);
  if (!r || typeof r.id !== "number") return null;
  const acf = asObject(r.acf) ?? {};
  const link = asString(r.link);
  const current = /\/products\/(.+?)\/([^/]+)\/?$/.exec(link);
  const legacy = current ? null : /\/product\/([^/]+)\/?$/.exec(link);
  const model = (current?.[2] ?? legacy?.[1] ?? asString(acf.model_number)).trim().toUpperCase();
  if (!model) return null;
  const specText = Object.entries(acf)
    .filter(([key]) => /specification|description|highlight/i.test(key) && !key.startsWith("has_"))
    .map(([, value]) => (typeof value === "string" ? stripTags(value) : ""))
    .join(" ");
  return {
    id: r.id,
    model,
    category: current?.[1] ?? `legacy/${(asString(acf.type) || "unknown").replace(/_/g, "-")}`,
    name: decodeEntities(asString(asObject(r.title)?.rendered)).trim(),
    link,
    status: asString(r.status) || "publish",
    fileIds: idsOf(acf.product_files),
    technologies: Array.isArray(acf.technology_type) ? acf.technology_type.map(asString) : [],
    text: specText,
  };
}

// ---------------------------------------------------------------- Wi-Fi generation

export type WifiGeneration = "Wi-Fi 7" | "Wi-Fi 6E" | "Wi-Fi 6" | "Wi-Fi 5" | "Wi-Fi 4";
const GENERATION_ORDER: WifiGeneration[] = ["Wi-Fi 7", "Wi-Fi 6E", "Wi-Fi 6", "Wi-Fi 5", "Wi-Fi 4"];
const FROM_TECHNOLOGY: Record<string, WifiGeneration> = {
  wifi7: "Wi-Fi 7", wifi6e: "Wi-Fi 6E", wifi6: "Wi-Fi 6", wifi5: "Wi-Fi 5", wifi4: "Wi-Fi 4",
};
const FROM_NAME: [RegExp, WifiGeneration][] = [
  [/(?:Cloud|Fit)\s*7/i, "Wi-Fi 7"], [/(?:Cloud|Fit)\s*6E/i, "Wi-Fi 6E"], [/(?:Cloud|Fit)\s*6/i, "Wi-Fi 6"], [/(?:Cloud|Fit)\s*5/i, "Wi-Fi 5"],
];
const FROM_TEXT: [RegExp, WifiGeneration][] = [
  [/Wi-?Fi\s*7|802\.11\s*be/i, "Wi-Fi 7"], [/Wi-?Fi\s*6E/i, "Wi-Fi 6E"], [/Wi-?Fi\s*6|802\.11\s*ax/i, "Wi-Fi 6"],
  [/Wi-?Fi\s*5|802\.11\s*ac/i, "Wi-Fi 5"], [/802\.11\s*n\b/i, "Wi-Fi 4"],
];

/**
 * Only for access points. The product's own technology field wins; then the
 * marketing name (Cloud6, Fit7); then the page text, which is the least
 * reliable, so the result says where it came from.
 */
export function wifiGeneration(product: WpProduct): { generation: WifiGeneration | null; source: "field" | "name" | "text" | null } {
  const isAccessPoint =
    (product.category.startsWith("wireless") || product.category.includes("access-point")) && !product.category.includes("accessor");
  if (!isAccessPoint) return { generation: null, source: null };
  const fromField = product.technologies
    .map((t) => FROM_TECHNOLOGY[t.toLowerCase().replace(/[^a-z0-9]/g, "")])
    .filter((g): g is WifiGeneration => Boolean(g))
    .sort((a, b) => GENERATION_ORDER.indexOf(a) - GENERATION_ORDER.indexOf(b));
  if (fromField.length) return { generation: fromField[0], source: "field" };
  for (const [pattern, generation] of FROM_NAME) if (pattern.test(product.name)) return { generation, source: "name" };
  for (const [pattern, generation] of FROM_TEXT) if (pattern.test(product.text)) return { generation, source: "text" };
  return { generation: null, source: null };
}
