/**
 * Which navigations would throw away unsaved work — as a pure function, so
 * the rules can be tested without a browser.
 *
 * Why this exists: none of SpecHub's editors warned before leaving. A PM
 * fixed a mistranslated spec label, clicked away, and the fix was simply not
 * there an hour later — the page only saves on Save All, and closing the tab,
 * a sidebar link or a breadcrumb all discarded the edit without a word
 * (2026-10-01). The hook that uses this is `use-unsaved-changes.ts`.
 *
 * What it can and cannot catch: a link click inside the app (sidebar,
 * breadcrumbs, any <a>) and anything that unloads the page (closing the tab,
 * reloading, typing a URL). NOT the browser's Back button: in the App Router
 * that is a same-document history step with no event that can be cancelled,
 * and fighting Next's own popstate handling breaks navigation outright.
 */

export const UNSAVED_MESSAGE = "有還沒儲存的修改，離開這一頁就會遺失。確定要離開嗎？";

export interface LinkClick {
  /** The anchor's resolved href (`a.href`, absolute). Null when it has none. */
  href: string | null;
  target: string | null;
  download: boolean;
  /** MouseEvent.button — 0 is the primary button. */
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** Something else already cancelled this click (e.g. a disabled link). */
  defaultPrevented: boolean;
}

/**
 * Would following this click leave the current page in this tab?
 *
 * Opening something elsewhere (new tab, download, modified click) keeps the
 * page and its state, so it is not a reason to ask. Neither is a link back to
 * the same page, or a jump to an anchor on it.
 */
export function leavesPage(click: LinkClick, currentHref: string): boolean {
  if (click.defaultPrevented) return false;
  if (!click.href) return false;
  if (click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (click.download) return false;
  if (click.target && click.target !== "_self") return false;

  let next: URL;
  let here: URL;
  try {
    next = new URL(click.href, currentHref);
    here = new URL(currentHref);
  } catch {
    return false;
  }
  if (next.protocol === "mailto:" || next.protocol === "tel:" || next.protocol === "javascript:") return false;
  // Same document, only the fragment differs (or nothing does).
  if (next.origin === here.origin && next.pathname === here.pathname && next.search === here.search) return false;
  return true;
}

/**
 * Do two values hold the same content, ignoring object key order?
 *
 * For editors that decide "unsaved" by comparing what they hold with what the
 * server sent back. JSON.stringify is not enough there: jsonb columns come
 * back with their keys re-ordered (Postgres sorts them), so a label saved as
 * `{ x, y, text }` returns as `{ x, y, text }` in some other order and would
 * read as changed the moment it was saved — a guard that nags after every Save
 * is a guard people learn to click through.
 */
export function sameContent(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
