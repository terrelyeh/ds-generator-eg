import { describe, expect, it } from "vitest";
import { canClear } from "./drive-images";

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
