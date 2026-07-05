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

export async function passcodeAttemptAllowed(scope: string, request: Request): Promise<boolean> {
  const ip = (
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    request.headers.get("x-real-ip") ??
    "unknown"
  ).trim();

  try {
    const { data, error } = (await createAdminClient().rpc("auth_rate_check", {
      p_key: `${scope}:${ip}`,
      p_max_attempts: MAX_ATTEMPTS,
      p_window_seconds: WINDOW_SECONDS,
    })) as { data: boolean | null; error: unknown };
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
