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

/** Null when SpecHub has no product with this model number. */
export async function loadBaseline(supabase: SupabaseClient, model: string): Promise<SpecHubBaseline> {
  const { data: product } = (await supabase
    .from("products")
    .select("id, model_name, current_versions")
    .ilike("model_name", model.replace(/[%_\\]/g, "\\$&"))
    .maybeSingle()) as { data: { id: string; model_name: string; current_versions: Record<string, string> | null } | null };
  if (!product) return null;

  const { data: rows } = (await supabase
    .from("versions")
    .select("version, locale, generated_at, pdf_storage_path")
    .eq("product_id", product.id)) as { data: VersionRow[] | null };

  const baseline: Partial<Record<DocLanguage, SpecHubVersion>> = {};
  const current = product.current_versions ?? {};
  await Promise.all(
    Object.entries(SITE_LANGUAGE).map(async ([locale, language]) => {
      const mine = (rows ?? []).filter((r) => (r.locale ?? "en") === locale);
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
