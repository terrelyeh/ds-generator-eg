/**
 * Per-workspace passcode session (for /ask/<slug> department entries).
 *
 * Same idea as demo-session, but keyed per workspace: after a visitor enters a
 * workspace's correct passcode (verified server-side against passcode_hash),
 * /api/ws-auth issues an httpOnly cookie `ws_<slug>` whose value is an HMAC of
 * `ws:<slug>` keyed by a server secret (API_KEY_ENC_SECRET). The cookie proves
 * "this visitor passed workspace <slug>'s passcode" and can't be forged.
 *
 * Verifiable in BOTH the Edge proxy and Node route handlers (Web Crypto), with
 * no DB lookup — the slug is in the cookie name and the token is HMAC(slug).
 */

export const WS_COOKIE_PREFIX = "ws_";

export function workspaceCookieName(slug: string): string {
  return `${WS_COOKIE_PREFIX}${slug}`;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC token for a workspace slug, or null if no server secret is configured. */
export async function computeWorkspaceToken(slug: string): Promise<string | null> {
  const secret = process.env.API_KEY_ENC_SECRET;
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`ws:${slug}`));
  return toHex(sig);
}

/** Constant-time-ish comparison of a cookie value to the expected token. */
export async function isValidWorkspaceToken(slug: string, value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const expected = await computeWorkspaceToken(slug);
  if (!expected || value.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ value.charCodeAt(i);
  return diff === 0;
}

/**
 * True if any `ws_<slug>` cookie in the list carries a valid token. Used by the
 * Edge proxy to let /api/ask through for workspace visitors (the route handler
 * then re-verifies the SPECIFIC workspace named in the request body).
 */
export async function hasAnyValidWorkspaceCookie(
  cookies: { name: string; value: string }[],
): Promise<boolean> {
  for (const c of cookies) {
    if (!c.name.startsWith(WS_COOKIE_PREFIX)) continue;
    const slug = c.name.slice(WS_COOKIE_PREFIX.length);
    if (await isValidWorkspaceToken(slug, c.value)) return true;
  }
  return false;
}
