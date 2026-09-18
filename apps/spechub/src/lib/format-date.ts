/**
 * Dates that are rendered during a React render pass.
 *
 * `toLocaleDateString()` without a `timeZone` formats in whatever zone the
 * runtime happens to be in. On Vercel the server renders in UTC and the
 * reader's browser renders in Asia/Taipei, so the two passes disagree for
 * any timestamp from 16:00 UTC onwards — the server writes "Sep 4, 2026"
 * into the HTML, the browser hydrates it as "Sep 5, 2026", and React throws
 * away the server markup with "Hydration failed".
 *
 * Anchoring to an explicit zone and locale makes both passes agree. Taipei is
 * the right zone rather than merely a safe one: these timestamps are when a
 * Taiwan PM last touched the sheet, so a Taipei calendar day is the thing the
 * reader means. `src/components/website/model-check-view.tsx` pins the same
 * zone for the 官網 tables; it formats ISO-style (sv-SE) on purpose, so it
 * keeps its own formatters rather than sharing these.
 *
 * Reader-local time is a different requirement, and `LocalTime`
 * (`src/components/changelog/local-time.tsx`) is how to render it: the server
 * cannot know the reader's zone, so it renders nothing and the browser fills
 * it in.
 */

const TIME_ZONE = "Asia/Taipei";
const LOCALE = "en-US";

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sep 4, 2026" — the Taipei calendar day, wherever this runs. */
export function formatDate(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? dateFormat.format(d) : "—";
}
