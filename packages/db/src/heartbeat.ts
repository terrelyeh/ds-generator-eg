/**
 * Record that a scheduled job reached its end.
 *
 * See migration 00054 for why side effects could not answer this: a sync
 * that found nothing to do and a sync that never ran leave the same trace.
 *
 * Never throws. A monitoring write must not be the thing that fails a job
 * it is only observing — but it is logged, because a heartbeat that
 * silently stops writing turns the monitor into a permanent false alarm.
 */
import { createAdminClient } from "./admin";
import { logIfDbError } from "./errors";

export async function recordHeartbeat(
  job: string,
  ok: boolean,
  detail?: string,
): Promise<void> {
  try {
    logIfDbError(
      `heartbeat ${job}`,
      await createAdminClient()
        .from("job_heartbeats" as "products")
        .upsert(
          {
            job,
            last_run_at: new Date().toISOString(),
            ok,
            detail: detail?.slice(0, 500) ?? null,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "job" },
        ),
    );
  } catch (err) {
    console.error(`[heartbeat] ${job} threw:`, err instanceof Error ? err.message : String(err));
  }
}
