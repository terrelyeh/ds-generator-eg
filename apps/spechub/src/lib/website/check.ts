import { judgeSite, type FoundDatasheet, type SiteSide, type SiteVerdict, type SpecHubBaseline } from "./compare";
import {
  fileFromRest,
  languageOf,
  looksLikeDatasheet,
  modelTokens,
  productFromRest,
  scopeOf,
  versionText,
  wifiGeneration,
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

// ---------------------------------------------------------------- a whole category on chosen sites

export type GenerationFilter = "7" | "6E" | "6" | "5";

/** URL category paths as filter options: each top level ("access-point") and each full path under it. */
export function categoryKeys(category: string): string[] {
  if (category.startsWith("legacy/")) return [category];
  const parts = category.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** Access points proper — the "wireless" category also holds power adapters and SFP modules, which have no generation. */
const isAccessPoint = (product: WpProduct) => product.category.includes("access-point");

const inCategory = (product: WpProduct, key: string) => key === "all" || product.category === key || product.category.startsWith(`${key}/`);

function matchesGeneration(product: WpProduct, filter: GenerationFilter | null): boolean {
  if (!filter) return true;
  const { generation } = wifiGeneration(product);
  if (filter === "6") return generation === "Wi-Fi 6" || generation === "Wi-Fi 6E";
  return generation === `Wi-Fi ${filter}`;
}

export interface SiteQueryModel {
  model: string;
  name: string;
  generation: string | null;
  /** The generation came from page text only, which is the least reliable source. */
  generationUncertain: boolean;
  verdicts: Partial<Record<SiteCode, SiteVerdict>>;
}

export interface SiteQueryResult {
  checkedAt: string;
  models: SiteQueryModel[];
  /** Access points left out because no generation could be read. */
  unknownGeneration: string[];
}

/**
 * Every product in a category on the chosen sites, in bulk: per site and
 * environment the product list, one request for the matched pages' file
 * lists and a few for the files themselves. Unlike a single-model check this
 * doesn't search for datasheets that aren't on a page — that search is per
 * model and would multiply the requests by the size of the category.
 */
export async function querySites(
  sites: readonly SiteCode[],
  filter: { category: string; generation: GenerationFilter | null },
  baselinesFor: (models: string[]) => Promise<Map<string, SpecHubBaseline>>,
  catalogFor: (config: SiteConfig) => Promise<Catalog> = sharedCatalog,
): Promise<SiteQueryResult> {
  const pairs = sites.flatMap((code) => (["production", "staging"] as const).map((env) => siteConfig(code, env)));

  const loaded = await Promise.all(
    pairs.map(async (config) => {
      if (!config.baseUrl) return { config, error: "還沒設定這個站的網址", catalog: null, matched: [] as WpProduct[], unreadable: [] as string[], files: new Map<number, WpFile[]>() };
      try {
        const catalog = await catalogFor(config);
        // Filter by generation before asking for any file lists: a category like
        // "wireless" is 116 pages, and a generation usually cuts that to a fifth.
        const matched = catalog.products.filter((p) => inCategory(p, filter.category) && matchesGeneration(p, filter.generation));
        const unreadable = filter.generation
          ? catalog.products.filter((p) => inCategory(p, filter.category) && isAccessPoint(p) && !wifiGeneration(p).generation).map((p) => p.model)
          : [];
        const ids = matched.map((p) => p.id);
        const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, (i + 1) * 100));
        const details = await Promise.all(
          chunks.map(async (chunk) => {
            const result = await wpGet<unknown[]>(config, `/wp-json/wp/v2/product_model?include=${chunk.join(",")}&per_page=100&_fields=id,link,acf.product_files`);
            const error = failure(result);
            if (error) throw new Error(error);
            return Array.isArray(result.data) ? result.data : [];
          }),
        );
        const fileIdsByProduct = new Map<number, number[]>();
        for (const record of details.flat()) {
          const product = productFromRest({ link: "", ...(record as object) });
          const id = (record as { id?: number }).id;
          if (typeof id === "number") fileIdsByProduct.set(id, product?.fileIds ?? []);
        }
        const allIds = [...new Set([...fileIdsByProduct.values()].flat())];
        const fileChunks = Array.from({ length: Math.ceil(allIds.length / 100) }, (_, i) => allIds.slice(i * 100, (i + 1) * 100));
        const byId = new Map((await Promise.all(fileChunks.map((c) => fetchFiles(config, `include=${c.join(",")}`)))).flat().map((f) => [f.id, f]));
        const files = new Map<number, WpFile[]>(
          matched.map((p) => [p.id, (fileIdsByProduct.get(p.id) ?? []).map((id) => byId.get(id)).filter((f): f is WpFile => Boolean(f))]),
        );
        return { config, error: null as string | null, catalog, matched, unreadable, files };
      } catch (error) {
        return { config, error: error instanceof Error ? error.message : "查詢失敗", catalog: null, matched: [] as WpProduct[], unreadable: [] as string[], files: new Map<number, WpFile[]>() };
      }
    }),
  );

  // Which models are in scope: on any chosen site, production or staging, in the category and generation.
  const byModel = new Map<string, WpProduct>();
  const unknownGeneration = new Set<string>(loaded.flatMap((l) => l.unreadable));
  for (const { matched } of loaded) {
    for (const product of matched) if (!byModel.has(product.model)) byModel.set(product.model, product);
  }
  const models = [...byModel.keys()].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const baselines = await baselinesFor(models);

  const sideFor = (config: SiteConfig, model: string): SiteSide => {
    const entry = loaded.find((l) => l.config.code === config.code && l.config.env === config.env)!;
    if (entry.error) return { error: entry.error, pageFound: false, datasheets: [] };
    const page = entry.catalog!.products.find((p) => p.model === model);
    if (!page) return { error: null, pageFound: false, datasheets: [] };
    const known = new Set([...entry.catalog!.known, model]);
    return {
      error: null,
      pageFound: true,
      datasheets: (entry.files.get(page.id) ?? []).filter(isDatasheet).map((f) => toFound(model, f, true, known)),
    };
  };

  return {
    checkedAt: new Date().toISOString(),
    unknownGeneration: [...unknownGeneration].filter((m) => !byModel.has(m)).sort(),
    models: models.map((model) => {
      const product = byModel.get(model)!;
      const { generation, source } = wifiGeneration(product);
      const verdicts: Partial<Record<SiteCode, SiteVerdict>> = {};
      for (const code of sites) {
        verdicts[code] = judgeSite(code, model, sideFor(siteConfig(code, "production"), model), sideFor(siteConfig(code, "staging"), model), baselines.get(model) ?? null);
      }
      return { model, name: product.name, generation, generationUncertain: source === "text", verdicts };
    }),
  };
}
