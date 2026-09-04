import { describe, expect, it } from "vitest";
import { canClear, DriveListingCache } from "./drive-images";

/**
 * Clearing an image column is a destructive answer to an ambiguous question,
 * so these are all about what counts as ambiguous. The old rule was just
 * `folder_listed`, and three separate situations satisfied it while meaning
 * "we could not tell": a folder id pointing one level too high, a download
 * that failed, and an upload that failed.
 */
const listed = { folder_listed: true, folder_empty: false, failed: [] as never[] };

describe("canClear", () => {
  it("clears when Drive answered and the file simply is not there", () => {
    expect(canClear(listed, "product_image")).toBe(true);
    expect(canClear(listed, "hardware_image")).toBe(true);
  });

  it("refuses when the folder could not be listed at all", () => {
    expect(canClear({ ...listed, folder_listed: false }, "product_image")).toBe(false);
  });

  it("refuses when the folder listed but held nothing", () => {
    // `ds_images_folder_id` set to the product-line folder instead of its
    // DS Images child lists zero files — and would otherwise clear the
    // artwork for every model on the line in one sync.
    expect(canClear({ ...listed, folder_empty: true }, "product_image")).toBe(false);
  });

  it("refuses for the image that errored, and only that one", () => {
    const partial = { ...listed, failed: ["hardware_image"] as never[] };
    expect(canClear(partial, "hardware_image")).toBe(false);
    expect(canClear(partial, "product_image")).toBe(true);
  });
});

describe("DriveListingCache", () => {
  const slowList = (calls: string[]) => async (id: string) => {
    calls.push(id);
    await new Promise((r) => setTimeout(r, 5));
    return new Map();
  };

  it("lists each folder once per run, even when callers overlap", async () => {
    // Four products asking for the same folder at the same moment must share
    // one in-flight request — memoising the value after the fact would let
    // all four miss together, which is exactly the situation concurrency
    // creates.
    const calls: string[] = [];
    const cache = new DriveListingCache(slowList(calls), async () => false);
    await Promise.all([cache.list("A"), cache.list("A"), cache.list("B"), cache.list("A")]);
    await cache.list("B");
    expect(calls).toEqual(["A", "B"]);
  });

  it("memoises the availability check the same way", async () => {
    const checks: string[] = [];
    const cache = new DriveListingCache(slowList([]), async (id) => {
      checks.push(id);
      return false;
    });
    await Promise.all([cache.unavailable("A"), cache.unavailable("A")]);
    expect(checks).toEqual(["A"]);
  });

  it("is scoped to one run: a fresh cache lists again", async () => {
    // A cache that outlived the run would show the next sync a listing from
    // before the PM uploaded the file they are now waiting on.
    const calls: string[] = [];
    await new DriveListingCache(slowList(calls), async () => false).list("A");
    await new DriveListingCache(slowList(calls), async () => false).list("A");
    expect(calls).toEqual(["A", "A"]);
  });
});
