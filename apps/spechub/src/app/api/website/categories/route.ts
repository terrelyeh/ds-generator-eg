import { NextResponse } from "next/server";
import { gate } from "@eg/auth/session";
import { categoryKeys, sharedCatalog } from "@/lib/website/check";
import { SITE_CODES, siteConfig, type SiteCode } from "@/lib/website/sites";

/**
 * GET /api/website/categories?sites=EU,APAC — the product categories the
 * chosen sites actually use, for the 依站台 filter.
 *
 * Sites name their URL paths differently from what anyone would guess
 * ("wireless/indoor-access-points", not "access-point"), so the options come
 * from the sites. Reading both environments also warms the product-list cache
 * that the query itself needs, so the first query after picking sites is the
 * fast one.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PRETTY: Record<string, string> = { ai_box: "AI Box", "ai-nvs": "AI NVS", "ai-camera": "AI Camera", sdwan: "SD-WAN" };

function label(key: string): string {
  if (key.startsWith("legacy/")) return `舊產品頁 · ${key.slice(7).replace(/[-_]/g, " ")}`;
  return key
    .split("/")
    .map((part) => PRETTY[part] ?? part.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" › ");
}

export async function GET(request: Request) {
  const denied = await gate("website_check.view");
  if (denied) return denied;

  const requested = (new URL(request.url).searchParams.get("sites") ?? "").split(",").map((s) => s.trim().toUpperCase());
  const sites = SITE_CODES.filter((code) => requested.includes(code)) as SiteCode[];
  if (!sites.length) return NextResponse.json({ error: "至少要選一個站" }, { status: 400 });

  const counts = new Map<string, Record<string, number>>();
  const errors: Partial<Record<SiteCode, string>> = {};
  await Promise.all(
    sites.map(async (code) => {
      try {
        // Staging is only fetched to warm the cache; the options come from production.
        const [production] = await Promise.all([sharedCatalog(siteConfig(code, "production")), sharedCatalog(siteConfig(code, "staging")).catch(() => null)]);
        for (const product of production.products) {
          for (const key of categoryKeys(product.category)) {
            const perSite = counts.get(key) ?? {};
            perSite[code] = (perSite[code] ?? 0) + 1;
            counts.set(key, perSite);
          }
        }
      } catch (error) {
        errors[code] = error instanceof Error ? error.message : "讀不到產品清單";
      }
    }),
  );

  const categories = [...counts.entries()]
    .map(([key, perSite]) => ({ key, label: label(key), perSite, total: Object.values(perSite).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => (a.key.startsWith("legacy/") ? 1 : 0) - (b.key.startsWith("legacy/") ? 1 : 0) || a.key.localeCompare(b.key));

  return NextResponse.json({ sites, categories, errors }, { headers: { "Cache-Control": "no-store" } });
}
