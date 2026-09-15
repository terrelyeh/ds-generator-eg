import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@eg/db/admin";
import { throwIfDbError } from "@eg/db/errors";
import { can } from "@eg/auth/permissions";
import { gate, gateWithRateLimit, getCurrentUser } from "@eg/auth/session";
import { loadBaseline } from "@/lib/website/baseline";
import { checkModel, sharedCatalog } from "@/lib/website/check";
import { loadMarks, targetsFromMarks, type MarkRow } from "@/lib/website/marks";
import { loadLanguageStates, loadSiteStates } from "@/lib/website/model-state";
import { SITE_CODES, siteConfig, type SiteCode } from "@/lib/website/sites";

/**
 * The website datasheet check for one model.
 *
 *   GET  ?model=ECW536         → the last saved check per site, SpecHub's
 *                                versions to read it against, each language's
 *                                latest version and 可上架 mark, and when each
 *                                site was last pushed
 *   POST { model, site }       → check one site now and save it
 *
 * One site per POST on purpose: the product page fires all five at once and
 * shows each site as it lands, instead of one request that makes people
 * wait for the slowest site.
 *
 * A language marked 可上架 is judged against the marked version, the same as
 * the daily check, so the tab and the reminders never disagree.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

function readModel(value: unknown): string | null {
  return typeof value === "string" && MODEL_PATTERN.test(value.trim()) ? value.trim().toUpperCase() : null;
}

type ProductRow = { id: string; model_name: string; current_versions: Record<string, string> | null };

async function findProduct(supabase: SupabaseClient, model: string): Promise<{ product: ProductRow | null; marks: MarkRow[] }> {
  const { data: product } = (await supabase
    .from("products")
    .select("id, model_name, current_versions")
    .ilike("model_name", model.replace(/[%_\\]/g, "\\$&"))
    .maybeSingle()) as { data: ProductRow | null };
  return { product, marks: product ? await loadMarks(supabase, [product.id]) : [] };
}

export async function GET(request: Request) {
  const denied = await gate("website_check.view");
  if (denied) return denied;

  const model = readModel(new URL(request.url).searchParams.get("model"));
  if (!model) return NextResponse.json({ error: "型號格式不對" }, { status: 400 });

  const supabase = createAdminClient();
  const [user, { product, marks }] = await Promise.all([getCurrentUser(), findProduct(supabase, model)]);
  const [{ modelName, baseline }, rows, languages, siteState] = await Promise.all([
    loadBaseline(supabase, model, product ? targetsFromMarks(marks, product.id) : undefined),
    supabase
      .from("website_checks")
      .select("site, checked_at, status, verdict, baseline")
      .eq("model_name", model) as unknown as Promise<{
      data: { site: string; checked_at: string; status: string; verdict: unknown; baseline: unknown }[] | null;
      error: { message: string } | null;
    }>,
    product ? loadLanguageStates(supabase, product, marks) : Promise.resolve([]),
    loadSiteStates(supabase),
  ]);
  if (rows.error) return NextResponse.json({ error: rows.error.message }, { status: 500 });

  return NextResponse.json(
    {
      model,
      productModel: modelName,
      productId: product?.id ?? null,
      baseline,
      languages,
      siteState,
      canMark: can(user?.role, "website_check.mark"),
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
  const [user, { product, marks }] = await Promise.all([getCurrentUser(), findProduct(supabase, model)]);
  const { modelName, baseline } = await loadBaseline(supabase, model, product ? targetsFromMarks(marks, product.id) : undefined);
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
        verdict: verdict as never,
        baseline: baseline as never,
      },
      { onConflict: "model_name,site" },
    ),
  );

  // Near-identical model numbers on this site (ECW536 → ECW536S), offered as a one-click add.
  const catalog = await sharedCatalog(siteConfig(site, "production")).catch(() => null);
  const variants = catalog ? [...catalog.known].filter((m) => m !== model && m.startsWith(model)).sort() : [];

  return NextResponse.json({ model, productModel: modelName, site, checkedAt: result.checkedAt, status: verdict.status, verdict, baseline, variants });
}
