/**
 * Passcode-only demo session.
 *
 * The /demo/* surface (EnGenie) is shown to people who do NOT have a
 * SpecHub Google account — access is gated by a shared passcode
 * (DEMO_ACCESS_KEY) instead of the normal RBAC. On correct passcode,
 * /api/demo-auth sets an httpOnly cookie whose value is an HMAC of a
 * fixed message keyed by DEMO_ACCESS_KEY. Because the key is server-only,
 * the cookie can't be forged. The proxy (Edge) and the demo-permitted API
 * handlers (Node) both verify it via `isValidDemoToken`.
 *
 * Web Crypto (crypto.subtle) is used so the same code runs in the Edge
 * proxy and Node route handlers.
 */

export const DEMO_COOKIE = "demo_auth";
const DEMO_MESSAGE = "engenie-demo-v1";

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compute the expected cookie token, or null if no passcode is configured. */
export async function computeDemoToken(): Promise<string | null> {
  const secret = process.env.DEMO_ACCESS_KEY;
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(DEMO_MESSAGE));
  return toHex(sig);
}

/** Constant-time-ish check that a cookie value matches the expected token. */
export async function isValidDemoToken(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const expected = await computeDemoToken();
  if (!expected || value.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ value.charCodeAt(i);
  }
  return diff === 0;
}
