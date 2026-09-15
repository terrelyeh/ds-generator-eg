import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { requireCron } from "@eg/auth/session";
import { recordHeartbeat } from "@eg/db/heartbeat";
import { runDailyCheck } from "@/lib/website/daily";

/**
 * 官網 Datasheet daily check — weekdays 09:30 TW. What it does is in
 * lib/website/daily.ts.
 *
 * `?dry=1` reads the sites and composes both digests without writing the
 * database or sending Telegram, for trying it from a terminal.
 *
 * It writes a heartbeat (job "website-check") so /api/cron/health notices when
 * it stops. A digest that isn't sent because the day had nothing in it looks
 * exactly like a job that didn't run, so the heartbeat is the only signal.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function run(request: Request) {
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const result = await runDailyCheck(createAdminClient(), { write: !dry, send: !dry });
    if (!dry) {
      await recordHeartbeat(
        "website-check",
        result.errors.length === 0,
        `${result.modelsOnSites} models, ${result.tracked.length} tracked, ${result.unmarkedCount} unmarked; push ${result.delivery.push}; mkt ${result.delivery.marketing}`,
      );
    }
    return NextResponse.json({
      ok: true,
      dry,
      checkedAt: result.checkedAt,
      modelsOnSites: result.modelsOnSites,
      checksSaved: result.checksSaved,
      tracked: result.tracked.length,
      unmarked: result.unmarkedCount,
      sites: result.sites.map((s) => ({ site: s.site, pending: s.pending.length, lastPushAt: s.lastPushAt, pushDetected: s.pushDetected, error: s.error })),
      blockers: result.blockers.length,
      delivery: result.delivery,
      errors: result.errors,
      ...(dry ? { pushDigest: result.pushDigest, marketingDigest: result.marketingDigest } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dry) await recordHeartbeat("website-check", false, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Vercel Cron invokes with GET. Bearer only — see requireCron. */
export async function GET(request: Request) {
  const denied = await requireCron(request);
  if (denied) return denied;
  return run(request);
}

export async function POST(request: Request) {
  const denied = await requireCron(request);
  if (denied) return denied;
  return run(request);
}
