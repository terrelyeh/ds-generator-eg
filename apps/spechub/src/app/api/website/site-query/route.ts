import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gateWithRateLimit } from "@eg/auth/session";
import { loadBaselines } from "@/lib/website/baseline";
import { querySites, type GenerationFilter } from "@/lib/website/check";
import type { SpecHubBaseline } from "@/lib/website/compare";
import { SITE_CODES, type SiteCode } from "@/lib/website/sites";

/**
 * POST /api/website/site-query { sites, category, generation? } — every
 * product in a category on the chosen sites, judged against SpecHub.
 *
 * Not saved: it skips the per-model search for datasheets that aren't on a
 * page, so it is a narrower result than the product page's check and must not
 * overwrite it.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const GENERATIONS: GenerationFilter[] = ["7", "6E", "6", "5"];

export async function POST(request: Request) {
  // Each call reads every chosen site twice over; ten a minute is plenty for a person.
  const denied = await gateWithRateLimit("website_check.view", { key: "website-site-query", max: 10, windowSeconds: 60 });
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { sites?: unknown; category?: unknown; generation?: unknown } | null;
  const sites = SITE_CODES.filter((code) => Array.isArray(body?.sites) && body.sites.includes(code)) as SiteCode[];
  const category = typeof body?.category === "string" && /^[a-z0-9_/-]{1,120}$/i.test(body.category) ? body.category : null;
  const generation = GENERATIONS.find((g) => g === body?.generation) ?? null;
  if (!sites.length || !category) {
    return NextResponse.json({ error: "需要至少一個站台和一個類別" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const names = new Map<string, { modelName: string | null; baseline: SpecHubBaseline }>();
  const result = await querySites(sites, { category, generation }, async (models) => {
    const loaded = await loadBaselines(supabase, models);
    for (const [model, entry] of loaded) names.set(model, entry);
    return new Map([...loaded].map(([model, { baseline }]) => [model, baseline]));
  });

  return NextResponse.json(
    {
      sites,
      category,
      generation,
      checkedAt: result.checkedAt,
      unknownGeneration: result.unknownGeneration,
      models: result.models.map((m) => ({ ...m, productModel: names.get(m.model)?.modelName ?? null, baseline: names.get(m.model)?.baseline ?? null })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
