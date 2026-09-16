import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { can } from "@eg/auth/permissions";
import { gate, getCurrentUser } from "@eg/auth/session";
import type { SiteVerdict } from "@/lib/website/compare";
import { loadMarks, toMark } from "@/lib/website/marks";
import { loadSiteStates } from "@/lib/website/model-state";
import type { DocLanguage } from "@/lib/website/parse";
import {
  describeSites,
  LOCALE_LANGUAGE,
  siteLanguage,
  trackVersion,
  unmarkedLatest,
  type SavedCheck,
  type TrackedVersion,
} from "@/lib/website/reminders";
import { SITE_CODES, type SiteCode } from "@/lib/website/sites";

/**
 * 官網查詢 · 上架追蹤: every 可上架 version and where it stands on its sites,
 * each site's pushes, and the latest versions nobody has marked yet — all
 * from the saved checks (the daily check refreshes them every weekday).
 */
export const dynamic = "force-dynamic";

interface ProductRow {
  id: string;
  model_name: string;
  full_name: string;
  status: string | null;
  current_versions: Record<string, string> | null;
}

export async function GET() {
  const denied = await gate("website_check.view");
  if (denied) return denied;

  const supabase = createAdminClient();
  const [user, marks, productsRes, versionsRes, siteState] = await Promise.all([
    getCurrentUser(),
    loadMarks(supabase),
    supabase.from("products").select("id, model_name, full_name, status, current_versions") as unknown as Promise<{ data: ProductRow[] | null; error: { message: string } | null }>,
    supabase.from("versions").select("product_id, locale, version, generated_at") as unknown as Promise<{
      data: { product_id: string; locale: string | null; version: string; generated_at: string }[] | null;
      error: { message: string } | null;
    }>,
    loadSiteStates(supabase),
  ]);
  if (productsRes.error || versionsRes.error) return NextResponse.json({ error: (productsRes.error ?? versionsRes.error)!.message }, { status: 500 });
  const products = productsRes.data ?? [];
  const versions = versionsRes.data ?? [];
  const now = new Date();

  const unmarked = unmarkedLatest(products, versions, marks, now);
  const readyMarks = marks.filter((m) => m.decision === "ready");
  const models = [...new Set([...readyMarks.map((m) => products.find((p) => p.id === m.product_id)?.model_name), ...unmarked.map((u) => u.model)])]
    .filter((m): m is string => Boolean(m))
    .map((m) => m.toUpperCase());

  const { data: checkRows, error: checkError } = models.length
    ? ((await supabase.from("website_checks").select("model_name, site, checked_at, verdict").in("model_name", models)) as {
        data: { model_name: string; site: string; checked_at: string; verdict: SiteVerdict }[] | null;
        error: { message: string } | null;
      })
    : { data: [], error: null };
  if (checkError) return NextResponse.json({ error: checkError.message }, { status: 500 });

  const checksFor = (model: string): Partial<Record<SiteCode, SavedCheck>> =>
    Object.fromEntries((checkRows ?? []).filter((r) => r.model_name === model.toUpperCase()).map((r) => [r.site, { verdict: r.verdict, checkedAt: r.checked_at }]));
  const availableFor = (product: ProductRow) =>
    new Set<DocLanguage>((["en", "ja", "zh-TW"] as const).filter((l) => product.current_versions?.[l]).map((l) => LOCALE_LANGUAGE[l]));
  const generatedAt = (productId: string, locale: string, version: string) =>
    versions
      .filter((v) => v.product_id === productId && (v.locale ?? "en") === locale && v.version === version)
      .map((v) => v.generated_at)
      .sort()
      .pop() ?? null;

  const tracked: (TrackedVersion & { productId: string; locale: string; name: string; latestVersion: string | null })[] = [];
  for (const row of readyMarks) {
    const product = products.find((p) => p.id === row.product_id);
    if (!product) continue;
    const entry = trackVersion({
      model: product.model_name,
      mark: toMark(row),
      currentGeneratedAt: generatedAt(product.id, row.locale, row.version),
      available: availableFor(product),
      checks: checksFor(product.model_name),
    });
    tracked.push({ ...entry, productId: product.id, locale: row.locale, name: product.full_name, latestVersion: product.current_versions?.[row.locale] ?? null });
  }
  tracked.sort((a, b) => a.model.localeCompare(b.model, "en", { numeric: true }) || a.language.localeCompare(b.language));

  const unmarkedRows = unmarked.map((u) => {
    const product = products.find((p) => p.id === u.productId)!;
    const language = LOCALE_LANGUAGE[u.locale];
    const checks = checksFor(u.model);
    const sites = SITE_CODES.filter((site) => siteLanguage(site, availableFor(product)) === language).map((site) =>
      trackVersion({
        model: u.model,
        mark: { locale: u.locale, decision: "ready", version: u.version, generatedAt: u.generatedAt, markedAt: u.generatedAt, markedBy: null },
        currentGeneratedAt: u.generatedAt,
        available: availableFor(product),
        checks,
      }).sites.find((s) => s.site === site)!,
    );
    return { ...u, language, name: product.full_name, ...describeSites(sites) };
  });

  const sites = SITE_CODES.map((site) => {
    const state = siteState[site];
    const onSite = tracked.flatMap((t) => t.sites.filter((s) => s.site === site));
    const pushTracked = onSite.filter((s) => s.stage === "push").length;
    return {
      site,
      lastPushAt: state?.lastPushAt ?? null,
      pushDetected: state?.pushDetected ?? false,
      /** Marked versions marketing has to do something about on this site. */
      toHandle: onSite.filter((s) => s.stage === "upload" || s.stage === "fix").length,
      /** Everything the next push publishes, marked or not — what the pusher's digest lists. */
      pending: state?.pending.length ?? pushTracked,
      pendingUntracked: Math.max(0, (state?.pending.length ?? 0) - pushTracked),
    };
  });

  const checkedTimes = Object.values(siteState).map((s) => s?.checkedAt).filter((t): t is string => Boolean(t)).sort();
  return NextResponse.json(
    { lastDailyCheckAt: checkedTimes.pop() ?? null, canMark: can(user?.role, "website_check.mark"), sites, tracked, unmarked: unmarkedRows },
    { headers: { "Cache-Control": "no-store" } },
  );
}
