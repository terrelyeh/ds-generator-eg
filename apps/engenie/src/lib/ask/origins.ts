/**
 * Normalise a workspace's "allowed to embed" list into CSP frame-ancestors
 * sources (the proxy joins these into the /embed/<slug> response header).
 *
 * Web origins are reduced to scheme + host + port. Chrome extensions are
 * accepted too: the EnGenie side-panel extension iframes /embed/<slug> from
 * its own page, whose origin is chrome-extension://<id>.
 *
 * `new URL()` cannot produce that origin — for a non-web scheme `.origin` is
 * the string "null" — so these entries used to be dropped without a word. A
 * list emptied that way is worse than a rejected save: an empty list means no
 * CSP header at all, i.e. any site may embed the workspace.
 */

/** Chrome extension ids are 32 letters a–p (a hex SHA-256 prefix, remapped). */
const EXTENSION_RE = /^chrome-extension:\/\/([a-p]{32})(?:\/.*)?$/;

export function normalizeOrigins(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;

    const ext = EXTENSION_RE.exec(s.toLowerCase());
    if (ext) {
      out.push(`chrome-extension://${ext[1]}`);
      continue;
    }

    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      out.push(u.origin);
    } catch {
      /* skip invalid entries */
    }
  }
  return [...new Set(out)];
}
