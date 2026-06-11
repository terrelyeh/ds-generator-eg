/**
 * Per-workspace session token (for /ask/<slug> entries and embeddable widgets).
 *
 * Token format: `<version>.<exp>.<sig>` where
 *   version = ask_workspaces.token_version (bump it to REVOKE every outstanding
 *             token for a workspace without rotating the global secret),
 *   exp     = unix-second expiry (defence-in-depth — a leaked token dies),
 *   sig     = HMAC-SHA256(secret, `ws:<slug>:<version>:<exp>`).
 *
 * The signature uses WORKSPACE_TOKEN_SECRET (falls back to API_KEY_ENC_SECRET
 * if unset, so existing deploys keep working — set a dedicated secret in prod to
 * actually separate the signing key from the AES key-encryption secret).
 *
 * Cookie path (/ask/<slug>): the token is stored in the httpOnly `ws_<slug>`
 * cookie. Widget path (cross-site iframe, third-party cookies blocked): the
 * token rides in `Authorization: Bearer <slug>.<token>`.
 *
 * verifyWorkspaceToken() is DB-free (signature + expiry only) so the Edge proxy
 * can do a coarse gate; the route handler then ALSO checks the embedded version
 * against the workspace's current token_version (the authoritative revocation
 * check — it has the loaded workspace anyway).
 */

export const WS_COOKIE_PREFIX = "ws_";

/** Default token lifetime. The widget bearer (localStorage) lives this long;
 *  the /ask cookie is additionally capped by its own 12h maxAge in ws-auth. */
export const WS_TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

export function workspaceCookieName(slug: string): string {
  return `${WS_COOKIE_PREFIX}${slug}`;
}

function tokenSecret(): string | null {
  return process.env.WORKSPACE_TOKEN_SECRET || process.env.API_KEY_ENC_SECRET || null;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return toHex(sig);
}

/**
 * Issue a workspace token for the given slug + token_version. Returns null if no
 * signing secret is configured. `nowMs` is injectable for tests.
 */
export async function computeWorkspaceToken(
  slug: string,
  version: number,
  ttlSec: number = WS_TOKEN_TTL_SEC,
  nowMs: number = Date.now(),
): Promise<string | null> {
  const secret = tokenSecret();
  if (!secret) return null;
  const exp = Math.floor(nowMs / 1000) + ttlSec;
  const sig = await hmacHex(secret, `ws:${slug}:${version}:${exp}`);
  return `${version}.${exp}.${sig}`;
}

/**
 * Verify a token's signature + expiry (DB-free). Returns the embedded
 * { version } so callers can compare it to the workspace's current token_version
 * (revocation), or null if malformed / expired / forged.
 */
export async function verifyWorkspaceToken(
  slug: string,
  value: string | undefined | null,
  nowMs: number = Date.now(),
): Promise<{ version: number } | null> {
  if (!value) return null;
  const secret = tokenSecret();
  if (!secret) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [vStr, expStr, sig] = parts;
  const version = Number(vStr);
  const exp = Number(expStr);
  if (!Number.isInteger(version) || version < 1 || !Number.isFinite(exp)) return null;
  if (exp * 1000 <= nowMs) return null; // expired
  const expected = await hmacHex(secret, `ws:${slug}:${version}:${exp}`);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { version } : null;
}

/**
 * Embeddable widgets run in a cross-site iframe where third-party cookies are
 * blocked, so they carry the token in an Authorization header instead:
 *   `Authorization: Bearer <slug>.<token>`
 * The slug travels with the token (a token can't be verified without it). Parse
 * helper below; the bearer's token part may itself contain dots (version.exp.sig),
 * so we split only on the FIRST dot.
 */
export function parseWorkspaceBearer(authHeader: string | null | undefined): { slug: string; token: string } | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const v = authHeader.slice(7).trim();
  const dot = v.indexOf(".");
  if (dot <= 0) return null;
  const slug = v.slice(0, dot);
  const token = v.slice(dot + 1);
  if (!/^[a-z0-9-]+$/.test(slug) || !token) return null;
  return { slug, token };
}

/** Coarse, DB-free bearer check (signature + expiry, version-agnostic). The
 *  route handler re-checks the version against the workspace. Used by the proxy. */
export async function isValidWorkspaceBearer(authHeader: string | null | undefined): Promise<boolean> {
  const parsed = parseWorkspaceBearer(authHeader);
  if (!parsed) return false;
  return !!(await verifyWorkspaceToken(parsed.slug, parsed.token));
}

/**
 * Coarse, DB-free check: does any `ws_<slug>` cookie carry a signature-valid,
 * unexpired token? Used by the Edge proxy to let /api/ask through for workspace
 * visitors; the route handler then re-verifies the SPECIFIC workspace + version.
 */
export async function hasAnyValidWorkspaceCookie(
  cookies: { name: string; value: string }[],
): Promise<boolean> {
  for (const c of cookies) {
    if (!c.name.startsWith(WS_COOKIE_PREFIX)) continue;
    const slug = c.name.slice(WS_COOKIE_PREFIX.length);
    if (await verifyWorkspaceToken(slug, c.value)) return true;
  }
  return false;
}
