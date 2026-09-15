import { NextResponse } from "next/server";
import { gate } from "@eg/auth/session";
import { allSiteConfigs } from "@/lib/website/sites";
import { probeSite } from "@/lib/website/probe";

/**
 * GET /api/website/probe — can this deployment read the ten WordPress sites?
 *
 * Answers the questions the website datasheet check depends on, per site and
 * environment: does the request reach WordPress at all (or a bot challenge),
 * are the ACF fields we need readable without an account, and when an
 * Application Password is configured, can that account read drafts.
 *
 * Read-only against the sites. Reports hosts, never credentials. Run it from
 * the deployment, not a laptop: the open question is whether SiteGround lets
 * Vercel's datacenter addresses through.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await gate("website_check.view");
  if (denied) return denied;

  const sites = await Promise.all(allSiteConfigs().map(probeSite));
  return NextResponse.json(
    {
      region: process.env.VERCEL_REGION ?? "local",
      checkedAt: new Date().toISOString(),
      sites,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
