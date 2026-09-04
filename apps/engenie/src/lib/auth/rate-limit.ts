/**
 * Passcode brute-force limiter for the public auth endpoints
 * (/api/ws-auth, /api/demo-auth). DB-backed (RPC `auth_rate_check`,
 * migration 00027) so the window is shared across serverless instances —
 * an in-memory counter would reset on every cold start.
 *
 * Counts ALL attempts (not just failures) per surface+IP so the check runs
 * BEFORE any workspace lookup or hash comparison — no timing oracle, and a
 * legit user re-entering a passcode a handful of times is nowhere near the
 * limit. Fail-open on RPC errors: rate limiting must never take auth down.
 */

import { createAdminClient } from "@eg/db/admin";

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 300; // 10 attempts / 5 min per surface+IP

export const RATE_LIMIT_MSG = "Too many attempts — please wait a few minutes and try again.";

/**
 * A key that cannot be used to fill the table.
 *
 * `scope` carries a slug straight off the request, so an unvalidated one
 * meant every random slug inserted a permanent row — a free way to grow a
 * table that migration 00027 never prunes.
 */
function limiterKey(scope: string, ip: string): string {
  const safeScope = scope.replace(/[^a-z0-9:_-]/gi, "").slice(0, 80) || "unknown";
  return `${safeScope}:${ip.slice(0, 45)}`;
}

export async function passcodeAttemptAllowed(scope: string, request: Request): Promise<boolean> {
  const ip = (
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    request.headers.get("x-real-ip") ??
    "unknown"
  ).trim();

  try {
    const { data, error } = (await createAdminClient().rpc("auth_rate_check", {
      p_key: limiterKey(scope, ip),
      p_max_attempts: MAX_ATTEMPTS,
      p_window_seconds: WINDOW_SECONDS,
    })) as { data: boolean | null; error: { message?: string } | null };
    // Still fail-open — but loudly. A renamed RPC or a revoked grant used to
    // turn brute-force protection off across every surface with no symptom
    // at all: passcodes keep working, which is what the attacker wants too.
    if (error) {
      console.error(`[rate-limit] check failed for ${scope}, allowing: ${error.message ?? "unknown"}`);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error(
      `[rate-limit] check threw for ${scope}, allowing: ${err instanceof Error ? err.message : String(err)}`,
    );
    return true;
  }
}
