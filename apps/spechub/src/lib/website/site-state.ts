import { failure, isDatasheet, type Catalog } from "./check";
import { fileFromRest, fileVersionOf, gmtToIso, languageOf, modelTokens, versionText } from "./parse";
import type { PendingPush } from "./reminders";
import { siteConfig, type SiteCode, type SiteConfig } from "./sites";
import { wpGet } from "./wp-client";

/**
 * Per site: the newest content on production and on staging, and the
 * datasheets the next push would publish.
 *
 * Production is only ever overwritten with staging, so everything on staging
 * modified after production's newest content is waiting for a push — no need
 * to list both sides and diff them. Datasheets not in SpecHub are included:
 * the push publishes them too.
 */

const CONTENT_TYPES = ["file", "product_model"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

async function newestModified(config: SiteConfig): Promise<string | null> {
  const results = await Promise.all(
    CONTENT_TYPES.map((type) => wpGet<{ modified_gmt?: string }[]>(config, `/wp-json/wp/v2/${type}?orderby=modified&order=desc&per_page=1&_fields=id,modified_gmt`)),
  );
  const stamps: string[] = [];
  for (const result of results) {
    const error = failure(result);
    if (error) throw new Error(error);
    const stamp = gmtToIso(result.data?.[0]?.modified_gmt);
    if (stamp) stamps.push(stamp);
  }
  return stamps.sort().pop() ?? null;
}

export interface SiteReading {
  site: SiteCode;
  productionModified: string | null;
  stagingModified: string | null;
  pending: PendingPush[];
  error: string | null;
}

export async function readSiteState(site: SiteCode, catalogFor: (config: SiteConfig) => Promise<Catalog>): Promise<SiteReading> {
  const production = siteConfig(site, "production");
  const staging = siteConfig(site, "staging");
  if (!production.baseUrl || !staging.baseUrl) {
    return { site, productionModified: null, stagingModified: null, pending: [], error: "還沒設定這個站的網址" };
  }
  try {
    const [productionModified, stagingModified] = await Promise.all([newestModified(production), newestModified(staging)]);
    if (!productionModified || !stagingModified || stagingModified <= productionModified) {
      return { site, productionModified, stagingModified, pending: [], error: null };
    }

    // modified_after doesn't honor dates_are_gmt on these sites (it answers in
    // site-local time), so ask a day early and compare the GMT field here.
    const since = new Date(new Date(productionModified).getTime() - DAY_MS).toISOString().slice(0, 19);
    const records: { modified: string | null; record: unknown }[] = [];
    for (let page = 1; page <= 5; page++) {
      const result = await wpGet<unknown[]>(
        staging,
        `/wp-json/wp/v2/file?modified_after=${since}&dates_are_gmt=true&orderby=modified&order=desc&per_page=100&page=${page}&_fields=id,title,status,modified_gmt,acf`,
      );
      const error = failure(result);
      if (error) throw new Error(error);
      const batch = Array.isArray(result.data) ? result.data : [];
      records.push(...batch.map((record) => ({ modified: gmtToIso((record as { modified_gmt?: string }).modified_gmt), record })));
      if (batch.length < 100) break;
    }

    const known = (await catalogFor(staging).catch(() => null))?.known ?? new Set<string>();
    const pending: PendingPush[] = [];
    for (const { modified, record } of records) {
      if (!modified || modified <= productionModified) continue;
      const file = fileFromRest(record);
      if (!file || file.status !== "publish" || !isDatasheet(file)) continue;
      const models = [...modelTokens(`${file.title} ${file.filename}`, known)].sort();
      pending.push({
        label: models.length ? models.join("、") : file.title || file.filename,
        language: languageOf(file.filename, file.title, file.languageField),
        version: file.versionField || (models.length === 1 ? fileVersionOf(models[0], file.filename) : versionText(file.filename)),
        modifiedAt: file.uploadedAt ?? modified,
      });
    }
    return { site, productionModified, stagingModified, pending, error: null };
  } catch (error) {
    return { site, productionModified: null, stagingModified: null, pending: [], error: error instanceof Error ? error.message : "查詢失敗" };
  }
}
