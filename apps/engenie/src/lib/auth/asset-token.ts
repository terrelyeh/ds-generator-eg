/**
 * Short-lived signed links to knowledge images, for readers with no EnGenie
 * session.
 *
 * Internal-doc images live in the private `knowledge-assets` bucket behind
 * /api/knowledge-assets/<path>, which checks the session. Workspace, widget
 * and extension readers don't have one — they hold a workspace token, and an
 * <img> can't send an Authorization header. So their answers lost every SRS
 * diagram to a 401 that nobody saw (AnswerFigures hides images that fail).
 *
 * /api/ask therefore signs the asset URLs it hands those callers:
 * `?t=<exp>.<sig>`, sig = HMAC(secret, `asset:<storage path>:<exp>`). A token
 * opens exactly one image until it expires. It is only minted for sources the
 * caller has just retrieved — which already passed the workspace's scope and
 * knowledge-area checks — so it grants nothing retrieval hadn't. The `asset:`
 * prefix means it can never verify as a workspace token, or the reverse.
 */
import { hmacHex, tokenSecret } from "./workspace-session";

export const ASSET_TOKEN_TTL_SEC = 24 * 60 * 60;
const ASSET_PREFIX = "/api/knowledge-assets/";

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export async function signAssetPath(
  storagePath: string,
  ttlSec: number = ASSET_TOKEN_TTL_SEC,
  nowMs: number = Date.now(),
): Promise<string | null> {
  const secret = tokenSecret();
  if (!secret) return null;
  const exp = Math.floor(nowMs / 1000) + ttlSec;
  return `${exp}.${await hmacHex(secret, `asset:${storagePath}:${exp}`)}`;
}

export async function verifyAssetToken(
  storagePath: string,
  token: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const secret = tokenSecret();
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  if (!Number.isInteger(exp) || exp * 1000 <= nowMs) return false;
  const expected = await hmacHex(secret, `asset:${storagePath}:${exp}`);
  const sig = parts[1];
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/**
 * Sign every /api/knowledge-assets URL in the list (over the decoded storage
 * path — the one the route checks); anything else passes through untouched.
 */
export async function withAssetTokens(
  urls: string[],
  ttlSec: number = ASSET_TOKEN_TTL_SEC,
  nowMs: number = Date.now(),
): Promise<string[]> {
  return Promise.all(
    urls.map(async (url) => {
      if (!url.startsWith(ASSET_PREFIX)) return url;
      const pathPart = url.slice(ASSET_PREFIX.length).split(/[?#]/)[0];
      const storagePath = pathPart.split("/").map(safeDecode).join("/");
      const token = await signAssetPath(storagePath, ttlSec, nowMs);
      return token ? `${ASSET_PREFIX}${pathPart}?t=${token}` : url;
    }),
  );
}
