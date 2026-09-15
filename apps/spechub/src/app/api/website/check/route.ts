import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { throwIfDbError } from "@eg/db/errors";
import { gate, gateWithRateLimit, getCurrentUser } from "@eg/auth/session";
import { loadBaseline } from "@/lib/website/baseline";
import { checkModel, sharedCatalog } from "@/lib/website/check";
import { SITE_CODES, siteConfig, type SiteCode } from "@/lib/website/sites";

/**
 * The website datasheet check for one model.
 *
 *   GET  ?model=ECW536         → the last saved check per site, and SpecHub's
 *                                current versions to read it against
 *   POST { model, site }       → check one site now and save it
 *
 * One site per POST on purpose: the product page fires all five at once and
 * shows each site as it lands, instead of one request that makes people
 * wait for the slowest site.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

function readModel(value: unknown): string | null {
  return typeof value === "string" && MODEL_PATTERN.test(value.trim()) ? value.trim().toUpperCase() : null;
}

export async function GET(request: Request) {
  const denied = await gate("website_check.view");
  if (denied) return denied;

  const model = readModel(new URL(request.url).searchParams.get("model"));
  if (!model) return NextResponse.json({ error: "型號格式不對" }, { status: 400 });

  const supabase = createAdminClient();
  const [{ modelName, baseline }, rows] = await Promise.all([
    loadBaseline(supabase, model),
    supabase
      .from("website_checks")
      .select("site, checked_at, status, verdict, baseline")
      .eq("model_name", model) as unknown as Promise<{
      data: { site: string; checked_at: string; status: string; verdict: unknown; baseline: unknown }[] | null;
      error: { message: string } | null;
    }>,
  ]);
  if (rows.error) return NextResponse.json({ error: rows.error.message }, { status: 500 });

  return NextResponse.json(
    {
      model,
      productModel: modelName,
      baseline,
      sites: (rows.data ?? []).map((row) => ({
        site: row.site,
        checkedAt: row.checked_at,
        status: row.status,
        verdict: row.verdict,
        baseline: row.baseline,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  // Five requests per press of 重新查詢, each reading two sites' worth of pages.
  const denied = await gateWithRateLimit("website_check.view", { key: "website-check", max: 60, windowSeconds: 60 });
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { model?: unknown; site?: unknown } | null;
  const model = readModel(body?.model);
  const site = SITE_CODES.find((code) => code === body?.site) as SiteCode | undefined;
  if (!model || !site) return NextResponse.json({ error: "需要型號和站台（EU、JP、TW、APAC、IN）" }, { status: 400 });

  const supabase = createAdminClient();
  const [user, { modelName, baseline }] = await Promise.all([getCurrentUser(), loadBaseline(supabase, model)]);
  const result = await checkModel(model, baseline, { sites: [site], catalogFor: sharedCatalog });
  const verdict = result.sites[0];

  throwIfDbError("website_checks upsert")(
    await supabase.from("website_checks").upsert(
      {
        model_name: model,
        site,
        checked_at: result.checkedAt,
        checked_by: user?.id ?? null,
        status: verdict.status,
        verdict,
        baseline,
      },
      { onConflict: "model_name,site" },
    ),
  );

  // Near-identical model numbers on this site (ECW536 → ECW536S), offered as a one-click add.
  const catalog = await sharedCatalog(siteConfig(site, "production")).catch(() => null);
  const variants = catalog ? [...catalog.known].filter((m) => m !== model && m.startsWith(model)).sort() : [];

  return NextResponse.json({ model, productModel: modelName, site, checkedAt: result.checkedAt, status: verdict.status, verdict, baseline, variants });
}
