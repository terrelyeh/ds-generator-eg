import type { SupabaseClient } from "@supabase/supabase-js";
import { throwIfDbError } from "@eg/db/errors";
import { sendTelegramHtml } from "@/lib/notifications";
import { loadBaselines } from "./baseline";
import { createCatalogCache, querySites } from "./check";
import { LANGUAGE_LABEL, type SiteVerdict, type SpecHubBaseline } from "./compare";
import { loadMarks, targetsFromMarks, toMark, type MarkRow } from "./marks";
import type { DocLanguage } from "./parse";
import {
  buildMarketingDigest,
  buildPushDigest,
  nextPushState,
  trackVersion,
  unmarkedLatest,
  type PendingPush,
  type PushBlocker,
  type SavedCheck,
  type SiteStateRow,
  type TrackedVersion,
} from "./reminders";
import { readSiteState } from "./site-state";
import { SITE_CODES, type SiteCode } from "./sites";

/**
 * The 官網 Datasheet daily check (weekdays 09:30 TW, /api/cron/website-check).
 *
 *  1. Every product page on the five sites, production and staging, in bulk —
 *     the same read as 官網查詢 · 依站台 with category "all". Languages marked
 *     可上架 are judged against the marked version.
 *  2. The verdicts for SpecHub models are saved to website_checks, so the
 *     product page and the 上架追蹤 tab open on this morning's state.
 *  3. Per site: production and staging's newest content (a push moves
 *     production) and the datasheets waiting for the next push.
 *  4. Two Telegram digests, each only when it has something to say: the
 *     pusher's (site-wide) and marketing's (marked versions, plus how many
 *     latest versions nobody has marked).
 *
 * `write: false` reads and composes everything without touching the database
 * or Telegram — for trying it against the live sites.
 */

export interface DailyOptions {
  write: boolean;
  send: boolean;
  now?: Date;
}

export interface DailyResult {
  checkedAt: string;
  modelsOnSites: number;
  checksSaved: number;
  tracked: TrackedVersion[];
  unmarkedCount: number;
  sites: { site: SiteCode; productionModified: string | null; stagingModified: string | null; pending: PendingPush[]; lastPushAt: string | null; pushDetected: boolean; error: string | null }[];
  blockers: PushBlocker[];
  pushDigest: string | null;
  marketingDigest: string | null;
  delivery: { push: string; marketing: string };
  errors: string[];
}

interface ProductRow {
  id: string;
  model_name: string;
  status: string | null;
  current_versions: Record<string, string> | null;
}

interface VersionRow {
  product_id: string;
  locale: string | null;
  version: string;
  generated_at: string;
}

const nopage = (site: SiteCode): SiteVerdict => ({ site, status: "nopage", summary: "沒有產品頁", rows: [], missing: [], languages: {}, issues: [] });

export function trackingLink(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return `${host ? `https://${host}` : "https://ds-generator-eg.vercel.app"}/website?tab=tracking`;
}

export async function runDailyCheck(supabase: SupabaseClient, options: DailyOptions): Promise<DailyResult> {
  const now = options.now ?? new Date();
  const errors: string[] = [];
  const catalogFor = createCatalogCache();

  const [marks, productsRes, versionsRes, previousRes] = await Promise.all([
    loadMarks(supabase),
    supabase.from("products").select("id, model_name, status, current_versions") as unknown as Promise<{ data: ProductRow[] | null; error: { message: string } | null }>,
    supabase.from("versions").select("product_id, locale, version, generated_at") as unknown as Promise<{ data: VersionRow[] | null; error: { message: string } | null }>,
    supabase.from("website_site_state").select("site, checked_at, production_modified, last_push_at, push_detected") as unknown as Promise<{
      data: (SiteStateRow & { site: string })[] | null;
      error: { message: string } | null;
    }>,
  ]);
  for (const res of [productsRes, versionsRes, previousRes]) if (res.error) throw new Error(res.error.message);
  const products = productsRes.data ?? [];
  const versions = versionsRes.data ?? [];

  // 1. Every product page on every site, judged against marks where there are any.
  const baselines = new Map<string, SpecHubBaseline>();
  const [query, readings] = await Promise.all([
    querySites(
      SITE_CODES,
      { category: "all", generation: null },
      async (models) => {
        const loaded = await loadBaselines(supabase, models, (productId) => targetsFromMarks(marks, productId));
        for (const [model, entry] of loaded) baselines.set(model, entry.baseline);
        return new Map([...loaded].map(([model, entry]) => [model, entry.baseline]));
      },
      catalogFor,
    ),
    Promise.all(SITE_CODES.map((site) => readSiteState(site, catalogFor))),
  ]);
  const verdictsByModel = new Map(query.models.map((m) => [m.model, m.verdicts]));

  // 2. Save SpecHub models' verdicts.
  let checksSaved = 0;
  if (options.write) {
    const rows = query.models
      .filter((m) => baselines.get(m.model))
      .flatMap((m) =>
        SITE_CODES.map((site) => {
          const verdict = m.verdicts[site]!;
          return { model_name: m.model, site, checked_at: query.checkedAt, checked_by: null, status: verdict.status, verdict, baseline: baselines.get(m.model) ?? null };
        }),
      );
    for (let i = 0; i < rows.length; i += 100) {
      throwIfDbError("website_checks daily upsert")(await supabase.from("website_checks").upsert(rows.slice(i, i + 100) as never, { onConflict: "model_name,site" }));
    }
    checksSaved = rows.length;
  }

  // Marked versions on the sites that take their language.
  const tracked: TrackedVersion[] = [];
  for (const row of marks.filter((m: MarkRow) => m.decision === "ready")) {
    const product = products.find((p) => p.id === row.product_id);
    if (!product) continue;
    const mark = toMark(row);
    const model = product.model_name.toUpperCase();
    const verdicts = verdictsByModel.get(model);
    const checks: Partial<Record<SiteCode, SavedCheck>> = Object.fromEntries(
      SITE_CODES.map((site) => [site, { verdict: verdicts?.[site] ?? nopage(site), checkedAt: query.checkedAt }]),
    );
    const mine = versions.filter((v) => v.product_id === product.id);
    const available = new Set<DocLanguage>(
      (["en", "ja", "zh-TW"] as const).filter((locale) => product.current_versions?.[locale]).map((locale) => (locale === "zh-TW" ? "zh" : locale)),
    );
    const currentGeneratedAt =
      mine
        .filter((v) => (v.locale ?? "en") === row.locale && v.version === row.version)
        .map((v) => v.generated_at)
        .sort()
        .pop() ?? null;
    tracked.push(trackVersion({ model: product.model_name, mark, currentGeneratedAt, available, checks }));
  }
  tracked.sort((a, b) => a.model.localeCompare(b.model, "en", { numeric: true }) || a.language.localeCompare(b.language));

  const unmarked = unmarkedLatest(products, versions, marks, now);

  // 3. Pushes.
  const previous = new Map((previousRes.data ?? []).map((row) => [row.site, row]));
  const sites = readings.map((reading) => {
    if (reading.error) errors.push(`${reading.site} 推送狀態讀取失敗：${reading.error}`);
    const push = reading.error
      ? { lastPushAt: previous.get(reading.site)?.last_push_at ?? null, pushDetected: previous.get(reading.site)?.push_detected ?? false }
      : nextPushState(previous.get(reading.site) ?? null, { productionModified: reading.productionModified, checkedAt: now.toISOString() });
    return { ...reading, ...push };
  });
  if (options.write) {
    const rows = sites
      .filter((s) => !s.error)
      .map((s) => ({
        site: s.site,
        checked_at: now.toISOString(),
        production_modified: s.productionModified,
        staging_modified: s.stagingModified,
        last_push_at: s.lastPushAt,
        push_detected: s.pushDetected,
        pending: s.pending,
      }));
    if (rows.length) throwIfDbError("website_site_state upsert")(await supabase.from("website_site_state").upsert(rows as never, { onConflict: "site" }));
  }

  // A push overwrites production for every model, so any production-only copy blocks it, marked or not.
  const blockers: PushBlocker[] = query.models.flatMap((m) =>
    SITE_CODES.flatMap((site) =>
      Object.entries(m.verdicts[site]?.languages ?? {})
        .filter(([, v]) => v?.status === "prodnewer")
        .map(([language, v]) => ({ site, model: m.model, why: `${LANGUAGE_LABEL[language as DocLanguage]}版${v!.why}` })),
    ),
  );

  // 4. Digests.
  const pushDigest = buildPushDigest({
    now,
    blockers,
    pending: Object.fromEntries(sites.map((s) => [s.site, s.pending])),
    lastPush: Object.fromEntries(sites.map((s) => [s.site, { at: s.lastPushAt, detected: s.pushDetected }])),
  });
  const marketingDigest = buildMarketingDigest({ now, tracked, unmarkedCount: unmarked.length, link: trackingLink() });

  const delivery = { push: "nothing to send", marketing: "nothing to send" };
  if (options.send) {
    if (pushDigest) {
      const r = await sendTelegramHtml(process.env.TELEGRAM_WEBSITE_PUSH_CHAT_ID, pushDigest);
      delivery.push = r.detail ? `${r.status}: ${r.detail}` : r.status;
      if (r.status === "failed") errors.push(`推送提醒發送失敗：${r.detail}`);
    }
    if (marketingDigest) {
      const r = await sendTelegramHtml(process.env.TELEGRAM_WEBSITE_MKT_CHAT_ID, marketingDigest);
      delivery.marketing = r.detail ? `${r.status}: ${r.detail}` : r.status;
      if (r.status === "failed") errors.push(`行銷提醒發送失敗：${r.detail}`);
    }
  } else {
    if (pushDigest) delivery.push = "not sent (dry run)";
    if (marketingDigest) delivery.marketing = "not sent (dry run)";
  }

  return {
    checkedAt: query.checkedAt,
    modelsOnSites: query.models.length,
    checksSaved,
    tracked,
    unmarkedCount: unmarked.length,
    sites,
    blockers,
    pushDigest,
    marketingDigest,
    delivery,
    errors,
  };
}
