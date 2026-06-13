/**
 * Per-browser storage for a workspace's passcode token, used by the embeddable
 * widget. The widget runs in a cross-site iframe where third-party cookies are
 * blocked, so instead of the `ws_<slug>` cookie it keeps the HMAC token in
 * localStorage and sends it as `Authorization: Bearer <slug>.<token>`.
 *
 * localStorage in a third-party iframe is partitioned per top-level site, which
 * is exactly what we want: each host site authenticates once, independently.
 */

const PREFIX = "ws_token_";

export function getWsToken(slug: string): string {
  if (typeof window === "undefined" || !slug) return "";
  try {
    return window.localStorage.getItem(PREFIX + slug) ?? "";
  } catch {
    return "";
  }
}

export function setWsToken(slug: string, token: string) {
  if (typeof window === "undefined" || !slug) return;
  try {
    window.localStorage.setItem(PREFIX + slug, token);
  } catch {
    /* private mode / quota — ignore */
  }
}

export function clearWsToken(slug: string) {
  if (typeof window === "undefined" || !slug) return;
  try {
    window.localStorage.removeItem(PREFIX + slug);
  } catch {
    /* ignore */
  }
}
