import { describe, expect, it } from "vitest";
import {
  classifyPending,
  FOCUSED_CHUNK_INDEX,
  gitbookSourceId,
  indexExistingPages,
  pendingPageCount,
  missingMarkers,
  pageFingerprint,
  planPageWrites,
  selectPagesToFetch,
  staleChunkIndices,
  stripRelativeUpdated,
  visionState,
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

describe("classifyPending", () => {
  const OLD = "2026-06-01T00:00:00.000Z";
  const NEW = "2026-08-19T02:04:36.354Z";
  const edited = `${SPACE}/wireless/ssid`;
  const current = `${SPACE}/switch/vlan`;
  const brandNew = `${SPACE}/wireless/mesh`;
  const undated = `${SPACE}/appendix`;

  const pages = indexExistingPages([
    row(gitbookSourceId(edited), 0, { last_modified: OLD }),
    row(gitbookSourceId(current), 0, { last_modified: NEW }),
    row(gitbookSourceId(undated), 0, { last_modified: OLD }),
  ]);
  const sitemap = [
    { url: edited, lastModified: NEW },
    { url: current, lastModified: NEW },
    { url: brandNew, lastModified: NEW },
    { url: undated },
  ];

  it("splits what a sync would fetch into changed, added and undated", () => {
    expect(classifyPending(sitemap, pages)).toEqual({
      total: 4,
      changed: 1,
      added: 1,
      undated: 1,
      unchanged: 1,
    });
    expect(pendingPageCount(classifyPending(sitemap, pages))).toBe(3);
  });

  it("counts exactly the pages the crawl would go and fetch", () => {
    // The number on the badge and the number of pages the Sync then fetches
    // are the same number, or the badge is a rumour.
    const counts = classifyPending(sitemap, pages);
    expect(pendingPageCount(counts)).toBe(selectPagesToFetch(sitemap, pages, false).toFetch.length);
    expect(counts.total).toBe(new Set(sitemap.map((e) => gitbookSourceId(e.url))).size);
  });

  it("says nothing is waiting when every page carries the sitemap's date", () => {
    const counts = classifyPending([{ url: current, lastModified: NEW }], pages);
    expect(counts).toEqual({ total: 1, changed: 0, added: 0, undated: 0, unchanged: 1 });
    expect(pendingPageCount(counts)).toBe(0);
  });

  it("counts a URL the sitemap lists twice once, and an empty index as all added", () => {
    expect(classifyPending([{ url: current }, { url: `${current}/` }], pages).total).toBe(1);
    expect(classifyPending(sitemap, new Map())).toMatchObject({ added: 4, changed: 0, unchanged: 0 });
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
    // The /jp spaces print the same footer in Japanese.
    expect(stripRelativeUpdated("本文\n\n最終更新 8 か月前")).toBe("本文");
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

describe("visionState", () => {
  const a = "https://files.gitbook.io/a.png";
  const b = "https://files.gitbook.io/b.png";
  const none = new Set<string>();

  it("is complete when every image was described — or failed for good", () => {
    expect(visionState([a, b], new Map([[a, "x"], [b, "y"]]), none)).toBe("complete");
    // A 404 image will 404 next week too: write the page, don't retry it forever.
    expect(visionState([a, b], new Map([[a, "x"], [b, null]]), none)).toBe("complete");
    expect(visionState([], new Map(), none)).toBe("complete");
  });

  it("holds the page back when a call failed in a way worth retrying", () => {
    // A 429 used to leave the description out and record the page's date, so
    // an LED table stayed missing until someone edited the page.
    expect(visionState([a, b], new Map([[a, "x"]]), new Set([b]))).toBe("retry");
  });

  it("is deferred when the deadline stopped Vision before an image", () => {
    expect(visionState([a, b], new Map([[a, "x"]]), none)).toBe("deferred");
  });
});

describe("planPageWrites", () => {
  it("puts the markers on the last write, after the trim", () => {
    expect(planPageWrites([0, 2, FOCUSED_CHUNK_INDEX], [3])).toEqual([
      { kind: "upsert", chunkIndex: 0, withMarkers: false },
      { kind: "upsert", chunkIndex: 2, withMarkers: false },
      { kind: "trim", chunkIndices: [3] },
      { kind: "upsert", chunkIndex: FOCUSED_CHUNK_INDEX, withMarkers: true },
    ]);
  });

  it("records the markers on their own when nothing changed, rewriting them after a trim", () => {
    expect(planPageWrites([], [])).toEqual([{ kind: "markers", rewrite: false }]);
    expect(planPageWrites([], [2, 3])).toEqual([
      { kind: "trim", chunkIndices: [2, 3] },
      { kind: "markers", rewrite: true },
    ]);
  });

  it("gives a single changed chunk the markers", () => {
    expect(planPageWrites([1], [])).toEqual([{ kind: "upsert", chunkIndex: 1, withMarkers: true }]);
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
