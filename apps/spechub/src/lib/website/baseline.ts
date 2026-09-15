import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpecHubBaseline, SpecHubVersion } from "./compare";
import { parseVersion, compareVersions, type DocLanguage } from "./parse";

/**
 * What SpecHub says each language of a model should be: the current version,
 * when that PDF was made, and its size in Storage — the size is how a site's
 * file with the right version number but old content gets caught.
 *
 * Spanish has no regional site to go to, so it isn't included.
 */

const SITE_LANGUAGE: Record<string, DocLanguage> = { en: "en", ja: "ja", "zh-TW": "zh" };
const STORAGE_PREFIX = "/storage/v1/object/public/datasheets/";

interface VersionRow {
  version: string;
  locale: string | null;
  generated_at: string | null;
  pdf_storage_path: string | null;
}

async function storedSize(supabase: SupabaseClient, publicUrl: string | null): Promise<number | null> {
  const index = publicUrl?.indexOf(STORAGE_PREFIX) ?? -1;
  if (!publicUrl || index < 0) return null;
  const path = decodeURIComponent(publicUrl.slice(index + STORAGE_PREFIX.length));
  const slash = path.lastIndexOf("/");
  const { data, error } = await supabase.storage
    .from("datasheets")
    .list(slash > 0 ? path.slice(0, slash) : "", { search: path.slice(slash + 1), limit: 5 });
  if (error) return null;
  const match = data?.find((object) => object.name === path.slice(slash + 1));
  const size = Number(match?.metadata?.size);
  return Number.isFinite(size) && size > 0 ? size : null;
}

interface ProductRow {
  id: string;
  model_name: string;
  current_versions: Record<string, string> | null;
}

export interface SpecHubModel {
  /** SpecHub's own spelling of the model number (ECW201L-PoE), for links. Null when SpecHub doesn't have it. */
  modelName: string | null;
  baseline: SpecHubBaseline;
}

/** Null baseline when SpecHub has no product with this model number. */
export async function loadBaseline(supabase: SupabaseClient, model: string): Promise<SpecHubModel> {
  const { data: product } = (await supabase
    .from("products")
    .select("id, model_name, current_versions")
    .ilike("model_name", model.replace(/[%_\\]/g, "\\$&"))
    .maybeSingle()) as { data: ProductRow | null };
  if (!product) return { modelName: null, baseline: null };
  const { data: rows } = (await supabase
    .from("versions")
    .select("version, locale, generated_at, pdf_storage_path")
    .eq("product_id", product.id)) as { data: VersionRow[] | null };
  return { modelName: product.model_name, baseline: await baselineFrom(supabase, product, rows ?? []) };
}

/**
 * The same for many models at once — the site query can cover forty. One
 * products read, one versions read, and a Storage listing per PDF.
 * Keyed by the upper-cased model number the sites use.
 */
export async function loadBaselines(supabase: SupabaseClient, models: string[]): Promise<Map<string, SpecHubModel>> {
  const wanted = new Set(models.map((m) => m.toUpperCase()));
  const { data: products } = (await supabase.from("products").select("id, model_name, current_versions")) as { data: ProductRow[] | null };
  const matched = (products ?? []).filter((p) => wanted.has(p.model_name.toUpperCase()));
  const { data: rows } = matched.length
    ? ((await supabase
        .from("versions")
        .select("product_id, version, locale, generated_at, pdf_storage_path")
        .in("product_id", matched.map((p) => p.id))) as { data: (VersionRow & { product_id: string })[] | null })
    : { data: [] };
  const result = new Map<string, SpecHubModel>([...wanted].map((m) => [m, { modelName: null, baseline: null }]));
  await Promise.all(
    matched.map(async (product) => {
      const mine = (rows ?? []).filter((r) => r.product_id === product.id);
      result.set(product.model_name.toUpperCase(), { modelName: product.model_name, baseline: await baselineFrom(supabase, product, mine) });
    }),
  );
  return result;
}

async function baselineFrom(supabase: SupabaseClient, product: ProductRow, rows: VersionRow[]): Promise<SpecHubBaseline> {
  const baseline: Partial<Record<DocLanguage, SpecHubVersion>> = {};
  const current = product.current_versions ?? {};
  await Promise.all(
    Object.entries(SITE_LANGUAGE).map(async ([locale, language]) => {
      const mine = rows.filter((r) => (r.locale ?? "en") === locale);
      const newest = mine.reduce<VersionRow | null>((best, r) => {
        const v = parseVersion(r.version);
        const bv = best ? parseVersion(best.version) : null;
        return v && (!bv || compareVersions(v, bv) > 0) ? r : best;
      }, null);
      // current_versions also holds numbers detected from Drive for PDFs made
      // before SpecHub; those have no row, no date and no file to compare.
      const version = current[locale] ?? newest?.version;
      if (!version) return;
      const row = mine.find((r) => compareVersions(parseVersion(r.version) ?? [], parseVersion(version) ?? []) === 0) ?? null;
      baseline[language] = {
        version,
        generatedAt: row?.generated_at ?? null,
        filesize: row ? await storedSize(supabase, row.pdf_storage_path) : null,
      };
    }),
  );
  return baseline;
}
