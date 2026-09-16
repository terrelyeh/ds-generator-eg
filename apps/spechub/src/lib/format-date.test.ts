import { describe, expect, it, vi } from "vitest";

/**
 * The point of `formatDate` is that it does not care where it runs: Vercel
 * renders the HTML in UTC and the reader's browser hydrates it in Asia/Taipei,
 * and React tears the page down if the two disagree by so much as a character.
 *
 * So these tests re-import the module under different process timezones rather
 * than just asserting a string. Asserting a string only catches the bug when
 * the suite itself happens to run outside Taipei — true on CI, false on the
 * machines this is written on, which is the wrong way round for a regression
 * test.
 */
/** Sequential by construction: `process.env.TZ` is global, so two of these
 *  running concurrently would each overwrite the other's zone and the test
 *  would quietly pass against a broken formatter. */
async function formatUnder(tz: string, iso: string | null): Promise<string> {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  vi.resetModules();
  try {
    const { formatDate } = await import("./format-date");
    return formatDate(iso);
  } finally {
    process.env.TZ = previous;
    vi.resetModules();
  }
}

/** 20:30 UTC is 04:30 the next morning in Taipei — the case that used to make
 *  the server write one date into the HTML and the browser hydrate another. */
const CROSSES_MIDNIGHT = "2026-09-04T20:30:00.000Z";
/** 15:59 UTC is 23:59 the same evening in Taipei — the last minute that doesn't. */
const SAME_DAY = "2026-09-04T15:59:00.000Z";

const ZONES = ["UTC", "Asia/Taipei", "America/Los_Angeles", "Pacific/Kiritimati"];

describe("formatDate", () => {
  it("gives every timezone the same string for a timestamp past Taipei midnight", async () => {
    const rendered: string[] = [];
    for (const tz of ZONES) rendered.push(await formatUnder(tz, CROSSES_MIDNIGHT));
    expect(rendered).toEqual(ZONES.map(() => "Sep 5, 2026"));
  });

  it("gives every timezone the same string either side of the boundary", async () => {
    const rendered: string[] = [];
    for (const tz of ZONES) rendered.push(await formatUnder(tz, SAME_DAY));
    expect(rendered).toEqual(ZONES.map(() => "Sep 4, 2026"));
  });

  it("reports the Taipei calendar day, not the UTC one", async () => {
    // The two timestamps are 31 minutes apart and land on different Taipei days.
    expect(await formatUnder("UTC", SAME_DAY)).toBe("Sep 4, 2026");
    expect(await formatUnder("UTC", CROSSES_MIDNIGHT)).toBe("Sep 5, 2026");
  });

  it("renders an em dash for a missing or unparseable timestamp", async () => {
    expect(await formatUnder("UTC", null)).toBe("—");
    expect(await formatUnder("UTC", "")).toBe("—");
    expect(await formatUnder("UTC", "not a date")).toBe("—");
  });
});
