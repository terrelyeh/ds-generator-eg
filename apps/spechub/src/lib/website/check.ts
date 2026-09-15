import { judgeSite, type FoundDatasheet, type SiteSide, type SiteVerdict, type SpecHubBaseline } from "./compare";
import {
  fileFromRest,
  languageOf,
  looksLikeDatasheet,
  modelTokens,
  productFromRest,
  scopeOf,
  versionText,
  type WpFile,
  type WpProduct,
} from "./parse";
import { SITE_CODES, siteConfig, type SiteCode, type SiteConfig, type SiteEnv } from "./sites";
import { wpGet, type WpResult } from "./wp-client";

/**
 * Reading one model's datasheets off the ten site/environment pairs.
 *
 * Only public REST: published pages and files, no account. Per pair that is
 * the product list (cached for the whole check), the product's attached
 * files, and a search for datasheets that mention the model but aren't on
 * its page.
 */

const PRODUCT_FIELDS = "id,link,title,status,acf.model_number,acf.type,acf.technology_type";
const FILE_FIELDS = "id,title,status,acf";

function failure(result: WpResult<unknown>): string | null {
  if (result.kind === "json" && result.status === 200) return null;
  if (result.kind === "timeout") return "逾時";
  if (result.kind === "network") return "連不上";
  if (result.challenged) return "被網站的機器人驗證擋下";
  return `HTTP ${result.status ?? "?"}`;
}

export interface Catalog {
  products: WpProduct[];
  /** Model numbers with a digit — what counts as "a model" when reading titles. */
  known: Set<string>;
}

async function fetchCatalog(config: SiteConfig): Promise<Catalog> {
  const pageOf = (page: number) =>
    wpGet<unknown[]>(config, `/wp-json/wp/v2/product_model?per_page=100&page=${page}&_fields=${PRODUCT_FIELDS}`);
  const first = await pageOf(1);
  const firstError = failure(first);
  if (firstError) throw new Error(firstError);
  // The first page says how many there are; the rest go out together.
  const pages = Math.min(20, Math.ceil((first.total ?? 0) / 100));
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => pageOf(i + 2)));
  const products: WpProduct[] = [];
  for (const result of [first, ...rest]) {
    const error = failure(result);
    if (error) throw new Error(error);
    const batch = Array.isArray(result.data) ? result.data : [];
    products.push(...batch.map(productFromRest).filter((p): p is WpProduct => p !== null));
  }
  return { products, known: new Set(products.map((p) => p.model).filter((m) => /\d/.test(m))) };
}

/**
 * Product lists are the same for every model in a check, so they are fetched
 * once per site/environment. The cache holds promises, not results: models
 * are checked in parallel, and caching only finished lists would send the
 * same request once per model before the first one returned.
 */
export function createCatalogCache() {
  const pending = new Map<string, Promise<Catalog>>();
  return (config: SiteConfig): Promise<Catalog> => {
    const key = `${config.code}:${config.env}`;
    let promise = pending.get(key);
    if (!promise) {
      promise = fetchCatalog(config);
      pending.set(key, promise);
      promise.catch(() => pending.delete(key));
    }
    return promise;
  };
}

const SHARED_TTL_MS = 10 * 60 * 1000;
const shared = new Map<string, { at: number; promise: Promise<Catalog> }>();

/**
 * Product lists shared across requests on a warm instance, for ten minutes.
 *
 * Fetching them is most of a first check (two pages of ACF per site and
 * environment, 2–4s each), and they only change when someone adds a product
 * page. Files are never cached, so a datasheet uploaded a minute ago shows on
 * the next check; a brand-new product page can take up to ten minutes.
 */
export function sharedCatalog(config: SiteConfig): Promise<Catalog> {
  const key = `${config.code}:${config.env}:${config.baseUrl}`;
  const hit = shared.get(key);
  if (hit && Date.now() - hit.at < SHARED_TTL_MS) return hit.promise;
  const promise = fetchCatalog(config);
  shared.set(key, { at: Date.now(), promise });
  promise.catch(() => shared.delete(key));
  return promise;
}

async function fetchFiles(config: SiteConfig, query: string): Promise<WpFile[]> {
  const result = await wpGet<unknown[]>(config, `/wp-json/wp/v2/file?${query}&per_page=100&_fields=${FILE_FIELDS}`);
  const error = failure(result);
  if (error) throw new Error(error);
  return (Array.isArray(result.data) ? result.data : []).map(fileFromRest).filter((f): f is WpFile => f !== null);
}

function toFound(model: string, file: WpFile, onPage: boolean, known: Set<string>): FoundDatasheet {
  const { scope, otherModels } = scopeOf(model, file.title, file.filename, known);
  const withoutModel = file.filename.replace(new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  return {
    fileId: file.id,
    title: file.title,
    filename: file.filename,
    language: languageOf(file.filename, file.title, file.languageField),
    scope,
    otherModels,
    versionField: file.versionField,
    fileVersion: versionText(withoutModel),
    status: file.status,
    onPage,
    typeMismatch: file.type !== "data-sheet",
    filesize: file.filesize,
    uploadedAt: file.uploadedAt,
    uploaderId: file.uploaderId,
    url: file.url,
  };
}

const isDatasheet = (file: WpFile) => Boolean(file.filename) && (file.type === "data-sheet" || looksLikeDatasheet(file.title, file.filename));

export async function readSide(
  model: string,
  config: SiteConfig,
  catalogFor: (config: SiteConfig) => Promise<Catalog>,
): Promise<SiteSide> {
  if (!config.baseUrl) return { error: "還沒設定這個站的網址", pageFound: false, datasheets: [] };
  const target = model.toUpperCase();
  try {
    const catalog = await catalogFor(config);
    const known = new Set([...catalog.known, target]);
    const page = catalog.products.find((p) => p.model === target) ?? null;

    const attachedFiles = async (): Promise<WpFile[]> => {
      if (!page) return [];
      const detail = await wpGet<unknown>(config, `/wp-json/wp/v2/product_model/${page.id}?_fields=id,link,acf.product_files`);
      const error = failure(detail);
      if (error) throw new Error(error);
      const ids = productFromRest({ ...(detail.data as object), link: page.link })?.fileIds ?? [];
      const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, (i + 1) * 100));
      const files = (await Promise.all(chunks.map((chunk) => fetchFiles(config, `include=${chunk.join(",")}`)))).flat();
      const order = new Map(ids.map((id, index) => [id, index]));
      return files.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    };
    // The page's files and the search for off-page datasheets don't depend on each other.
    const [attached, found] = await Promise.all([attachedFiles(), fetchFiles(config, `search=${encodeURIComponent(target)}`)]);
    const attachedIds = new Set(attached.map((f) => f.id));
    const offPage = found.filter(
      (f) => !attachedIds.has(f.id) && isDatasheet(f) && modelTokens(`${f.title} ${f.filename}`, known).has(target),
    );

    return {
      error: null,
      pageFound: page !== null,
      datasheets: [
        ...attached.filter(isDatasheet).map((f) => toFound(target, f, true, known)),
        ...offPage.map((f) => toFound(target, f, false, known)),
      ],
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "查詢失敗", pageFound: false, datasheets: [] };
  }
}

export interface ModelCheck {
  model: string;
  checkedAt: string;
  sites: SiteVerdict[];
  issues: string[];
}

/** One model on the chosen sites (all five by default), production and staging in parallel. */
export async function checkModel(
  model: string,
  baseline: SpecHubBaseline,
  options: { sites?: readonly SiteCode[]; catalogFor?: (config: SiteConfig) => Promise<Catalog> } = {},
): Promise<ModelCheck> {
  const catalogFor = options.catalogFor ?? createCatalogCache();
  const codes = options.sites ?? SITE_CODES;
  const read = (code: SiteCode, env: SiteEnv) => readSide(model, siteConfig(code, env), catalogFor);
  const sites = await Promise.all(
    codes.map(async (code) => {
      const [production, staging] = await Promise.all([read(code, "production"), read(code, "staging")]);
      return judgeSite(code, model.toUpperCase(), production, staging, baseline);
    }),
  );
  return { model, checkedAt: new Date().toISOString(), sites, issues: sites.flatMap((s) => s.issues) };
}
