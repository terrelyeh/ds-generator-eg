/**
 * Passcode-only demo session.
 *
 * The /demo/* surface (EnGenie) is shown to people who do NOT have a SpecHub
 * Google account — access is gated by a shared passcode (DEMO_ACCESS_KEY)
 * instead of the normal RBAC. On a correct passcode, /api/demo-auth sets an
 * httpOnly cookie carrying an HMAC keyed by DEMO_ACCESS_KEY. The key is
 * server-only, so the cookie cannot be forged.
 *
 * The token used to be an HMAC of a FIXED string, which made it the same
 * value for every visitor and for ever. `maxAge` on the cookie is a request
 * to the browser, not a rule — so one leaked value (a shared booth laptop,
 * browser sync, a screenshot of devtools) was a permanent second password
 * that no amount of rotating a passcode would revoke, because nothing on the
 * server ever looked at when it was issued.
 *
 * Now the token is `<issuedAt>.<hmac(issuedAt)>` and the server checks the
 * age itself. Same shape, one field, and the demo stops being for ever.
 *
 * Web Crypto (crypto.subtle) is used so the same code runs in the Edge proxy
 * and in Node route handlers.
 */

export const DEMO_COOKIE = "demo_auth";
const DEMO_MESSAGE = "engenie-demo-v1";

/** How long a demo session is good for, enforced here rather than by the browser. */
export const DEMO_TTL_MS = 12 * 60 * 60 * 1000;

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** Mint a fresh demo token, or null if no passcode is configured. */
export async function computeDemoToken(now = Date.now()): Promise<string | null> {
  const secret = process.env.DEMO_ACCESS_KEY;
  if (!secret) return null;
  const issuedAt = String(now);
  return `${issuedAt}.${await sign(`${DEMO_MESSAGE}.${issuedAt}`, secret)}`;
}

/** Constant-time-ish comparison of two hex strings of equal length. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Is this cookie value a token we issued, and issued recently enough? */
export async function isValidDemoToken(
  value: string | undefined | null,
  now = Date.now(),
): Promise<boolean> {
  if (!value) return false;
  const secret = process.env.DEMO_ACCESS_KEY;
  if (!secret) return false;

  const dot = value.indexOf(".");
  if (dot <= 0) return false;

  const issuedAt = Number(value.slice(0, dot));
  const sig = value.slice(dot + 1);
  if (!Number.isFinite(issuedAt)) return false;

  // Age first: it is the cheap half, and a token from the future is a forged
  // one whose signature we need not spend time on either.
  const age = now - issuedAt;
  if (age < 0 || age > DEMO_TTL_MS) return false;

  return sameHex(await sign(`${DEMO_MESSAGE}.${issuedAt}`, secret), sig);
}
