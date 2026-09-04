/**
 * Fixed-window rate limit, shared across serverless instances.
 *
 * Backed by the `auth_rate_check` RPC (migration 00027): one row per key,
 * `attempts` reset when the window has elapsed, `true` while under the cap.
 * It was written for passcode brute-force protection; the paid endpoints —
 * translation, web scraping, the five Tender drafters, Ask — had no limit at
 * all, so one held-down key or one runaway script was a bill with no
 * ceiling. Same primitive, keyed per user (or per IP where there is none).
 *
 * Fails open, loudly: a limiter must never take the product down, but a
 * silent one is worse than none because everyone believes it is there.
 */
import { createAdminClient } from "./admin";

export async function rateLimitAllowed(
  key: string,
  maxPerWindow: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = (await createAdminClient().rpc("auth_rate_check", {
      p_key: key.slice(0, 200),
      p_max_attempts: maxPerWindow,
      p_window_seconds: windowSeconds,
    })) as { data: boolean | null; error: { message?: string } | null };
    if (error) {
      console.error(`[rate-limit] check failed for ${key}, allowing: ${error.message ?? "unknown"}`);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error(`[rate-limit] check threw for ${key}, allowing: ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }
}
