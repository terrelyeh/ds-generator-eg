import { describe, expect, it } from "vitest";
import {
  FOCUSED_CHUNK_INDEX,
  gitbookSourceId,
  indexExistingPages,
  missingMarkers,
  pageFingerprint,
  selectPagesToFetch,
  staleChunkIndices,
  stripRelativeUpdated,
  visionCoverage,
  type ExistingGitbookRow,
} from "./gitbook-plan";

const SPACE = "https://doc.engenius.ai/home-cloud-user-manual";

function row(sourceId: string, chunk: number, extra: Partial<ExistingGitbookRow> = {}): ExistingGitbookRow {
  return {
    source_id: sourceId,
    chunk_index: chunk,
    content_hash: `h-${sourceId}-${chunk}`,
    last_modified: null,
    page_hash: null,
    ...extra,
  };
}

describe("gitbookSourceId", () => {
  it("is the URL path, and 'index' for the root", () => {
    expect(gitbookSourceId(`${SPACE}/wireless/ssid/`)).toBe("home-cloud-user-manual/wireless/ssid");
    expect(gitbookSourceId("https://doc.engenius.ai/")).toBe("index");
  });
});

describe("selectPagesToFetch", () => {
  const OLD = "2026-06-01T00:00:00.000Z";
  const NEW = "2026-08-19T02:04:36.354Z";
  const url = `${SPACE}/wireless/ssid`;
  const id = gitbookSourceId(url);

  it("skips a page edited once and re-crawled — the date is on the chunks that changed", () => {
    // After the edit only chunk 2 was rewritten, so chunks 0–1 still carry
    // the original date. The old first-row test read OLD and fetched the
    // page again every week.
    const pages = indexExistingPages([
      row(id, 0, { last_modified: OLD }),
      row(id, 1, { last_modified: OLD }),
      row(id, 2, { last_modified: NEW }),
    ]);
    const plan = selectPagesToFetch([{ url, lastModified: NEW }], pages, false);
    expect(plan).toEqual({ toFetch: [], unchanged: 1 });
  });

  it("fetches a page whose sitemap date is on none of its chunks", () => {
    const pages = indexExistingPages([row(id, 0, { last_modified: OLD })]);
    expect(selectPagesToFetch([{ url, lastModified: NEW }], pages, false).toFetch).toHaveLength(1);
  });

  it("always fetches pages without <lastmod>, new pages, and everything under force", () => {
    const pages = indexExistingPages([row(id, 0, { last_modified: NEW })]);
    const other = `${SPACE}/switch/vlan`;
    expect(selectPagesToFetch([{ url: other, lastModified: NEW }], pages, false).toFetch).toHaveLength(1);
    expect(selectPagesToFetch([{ url }], pages, false).toFetch).toHaveLength(1);
    expect(selectPagesToFetch([{ url, lastModified: NEW }], pages, true)).toEqual({
      toFetch: [{ url, lastModified: NEW }],
      unchanged: 0,
    });
  });

  it("fetches a URL the sitemap lists twice only once", () => {
    const plan = selectPagesToFetch([{ url }, { url: `${url}/` }], new Map(), false);
    expect(plan.toFetch).toEqual([{ url }]);
  });
});

describe("stripRelativeUpdated / pageFingerprint", () => {
  const page = (content: string, imageUrls: string[] = ["https://files.gitbook.io/a.png"]) => ({
    content,
    imageUrls,
    sectionImages: new Map([
      ["_intro", []],
      ["LED Behavior", imageUrls],
    ]),
  });

  it("drops GitBook's relative date line and nothing that merely mentions updating", () => {
    const text = "# QSG Library\n\nPick a model.\n\nLast updated 26 days ago\n\nLast updated firmware notes are below.";
    expect(stripRelativeUpdated(text)).toBe("# QSG Library\n\nPick a model.\n\nLast updated firmware notes are below.");
    for (const when of ["a month ago", "about 1 month ago", "yesterday", "last year"]) {
      expect(stripRelativeUpdated(`Body\n\nLast updated ${when}`)).toBe("Body");
    }
  });

  it("does not change as the relative date ages", () => {
    expect(pageFingerprint(page("Body text\n\nLast updated 26 days ago"))).toBe(
      pageFingerprint(page("Body text\n\nLast updated about 1 month ago")),
    );
  });

  it("changes when the text, the images, or where an image sits changes", () => {
    const base = pageFingerprint(page("Body text"));
    expect(pageFingerprint(page("Body text, edited"))).not.toBe(base);
    expect(pageFingerprint(page("Body text", ["https://files.gitbook.io/b.png"]))).not.toBe(base);
    const moved = page("Body text");
    moved.sectionImages = new Map([["_intro", ["https://files.gitbook.io/a.png"]]]);
    expect(pageFingerprint(moved)).not.toBe(base);
  });
});

describe("visionCoverage", () => {
  const a = "https://files.gitbook.io/a.png";
  const b = "https://files.gitbook.io/b.png";

  it("is complete when every image has a description", () => {
    expect(visionCoverage([a, b], new Map([[a, "x"], [b, "y"]]))).toEqual({ attempted: true, described: true });
    expect(visionCoverage([], new Map())).toEqual({ attempted: true, described: true });
  });

  it("is attempted but not described when a call failed", () => {
    expect(visionCoverage([a, b], new Map([[a, "x"], [b, null]]))).toEqual({ attempted: true, described: false });
  });

  it("is not attempted when the deadline stopped Vision before an image", () => {
    expect(visionCoverage([a, b], new Map([[a, "x"]]))).toEqual({ attempted: false, described: false });
  });
});

describe("staleChunkIndices", () => {
  const id = "home-cloud-user-manual/qsg/ecw536";

  it("keeps the focused LED chunk the page still produces", () => {
    // The old cleanup compared stored rows against heading chunks only, so
    // it deleted the focused chunk on every re-crawl of its page.
    const page = indexExistingPages([row(id, 0), row(id, 1), row(id, FOCUSED_CHUNK_INDEX)]).get(id);
    expect(staleChunkIndices(page, new Set([0, 1, FOCUSED_CHUNK_INDEX]))).toEqual([]);
  });

  it("removes the tail of a page that got shorter and focused chunks under the old numbering", () => {
    const page = indexExistingPages([row(id, 0), row(id, 1), row(id, 2), row(id, FOCUSED_CHUNK_INDEX + 7)]).get(id);
    expect(staleChunkIndices(page, new Set([0, 1, FOCUSED_CHUNK_INDEX]))).toEqual([2, FOCUSED_CHUNK_INDEX + 7]);
  });

  it("removes nothing for a page that was never stored", () => {
    expect(staleChunkIndices(undefined, new Set([0]))).toEqual([]);
  });
});

describe("missingMarkers", () => {
  const id = "home-cloud-user-manual/wireless/ssid";
  const page = indexExistingPages([row(id, 0, { last_modified: "D1", page_hash: "F1" })]).get(id);

  it("is null when some chunk already carries both", () => {
    expect(missingMarkers(page, { lastModified: "D1", pageHash: "F1" })).toBeNull();
    expect(missingMarkers(page, {})).toBeNull();
  });

  it("names only what is missing", () => {
    // <lastmod> moved, text did not: the page needs its new date stored, or
    // it is fetched again next week for nothing.
    expect(missingMarkers(page, { lastModified: "D2", pageHash: "F1" })).toEqual({ lastModified: "D2" });
    expect(missingMarkers(page, { lastModified: "D1", pageHash: "F2" })).toEqual({ pageHash: "F2" });
    expect(missingMarkers(undefined, { lastModified: "D1" })).toEqual({ lastModified: "D1" });
  });
});
