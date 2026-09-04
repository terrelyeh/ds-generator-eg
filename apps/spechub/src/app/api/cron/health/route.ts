import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { requireCron } from "@eg/auth/session";
import { recordHeartbeat } from "@eg/db/heartbeat";
import { sendOpsMessage } from "@/lib/notifications";
import { evaluateHealth, formatHealthMessage, type Heartbeat } from "@/lib/monitoring/health";

export const maxDuration = 60;

/**
 * Daily health check — 10:00 TW, after the 09:00 sync and the 09:30 re-index.
 *
 * It exists because two outages in one week were found by hand, days late:
 * the sync 504'd repeatedly, and Ask's vector search raised on every call.
 * Neither produced a symptom anyone was looking at.
 *
 * The checks are in `lib/monitoring/health.ts` as a pure function with
 * tests; this gathers the inputs and delivers the verdict. The gathering is
 * itself the interesting part:
 *
 *  - Heartbeats, not side effects. See migration 00054.
 *  - Retrieval is PROBED, not inferred. A unit vector through
 *    `match_documents_scoped` executes the same `<=>` operator a real
 *    question does, which is precisely what broke; usage rows could not have
 *    told us, because Ask goes days between questions in normal weeks.
 *  - The corpus size is compared with the previous check's, carried in this
 *    job's own heartbeat detail. That guards the cleanup that deletes chunks
 *    for vanished sources: retrieval answers happily from a gutted index.
 *
 * ⚠️ Nothing watches this. If the cron itself stops, the alerts stop with
 * it — so on Mondays it reports that all is well, and more than a week of
 * silence means the monitor died rather than the system being healthy.
 */
async function runHealthCheck() {
  const supabase = createAdminClient();
  const now = new Date();

  const [{ data: hbRows }, { count: documentCount }] = await Promise.all([
    supabase
      .from("job_heartbeats" as "products")
      .select("job, last_run_at, ok, detail") as unknown as Promise<{ data: Heartbeat[] | null }>,
    supabase.from("documents" as "products").select("id", { count: "exact", head: true }),
  ]);
  const heartbeats = hbRows ?? [];

  // Synthetic retrieval probe. A unit vector is a valid embedding and needs
  // no OpenAI call; the threshold is high so it matches nothing. We are
  // asking whether the query can RUN, not what it returns.
  const probe = new Array(1536).fill(0);
  probe[0] = 1;
  let retrievalOk = true;
  let retrievalError: string | null = null;
  try {
    const { error } = await supabase.rpc("match_documents_scoped" as never, {
      query_embedding: JSON.stringify(probe),
      match_count: 1,
      match_threshold: 0.99,
      filter_source_type: null,
      filter_metadata: null,
      exclude_solutions: null,
      filter_source_types: null,
    } as never);
    if (error) {
      retrievalOk = false;
      retrievalError = typeof error === "object" ? JSON.stringify(error) : String(error);
    }
  } catch (err) {
    retrievalOk = false;
    retrievalError = err instanceof Error ? err.message : String(err);
  }

  // The previous count travels in our own heartbeat, so no extra table.
  const previous = heartbeats.find((h) => h.job === "health");
  const previousDocumentCount = previous?.detail?.match(/(\d+) docs/)?.[1]
    ? Number(previous.detail.match(/(\d+) docs/)![1])
    : null;

  const report = evaluateHealth(
    { heartbeats, retrievalOk, retrievalError, documentCount: documentCount ?? 0, previousDocumentCount },
    now,
  );

  const message = formatHealthMessage(report, now);
  const delivery = message ? await sendOpsMessage(message) : { sent: [], errors: [] };

  await recordHeartbeat(
    "health",
    report.alerts.length === 0,
    `${documentCount ?? 0} docs, ${report.alerts.length} alert(s)`,
  );

  return {
    ok: true,
    timestamp: now.toISOString(),
    alerts: report.alerts,
    all_clear_sent: report.allClear,
    notified: delivery,
  };
}

/** Vercel Cron invokes with GET. Bearer only — see requireCron. */
export async function GET(request: Request) {
  const denied = await requireCron(request);
  if (denied) return denied;
  return NextResponse.json(await runHealthCheck());
}

/** POST for a manual run from a terminal with the secret. */
export async function POST(request: Request) {
  const denied = await requireCron(request);
  if (denied) return denied;
  return NextResponse.json(await runHealthCheck());
}
