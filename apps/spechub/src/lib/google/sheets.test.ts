import { describe, expect, it } from "vitest";
import { isSpecFootnoteLabel } from "./sheets";

describe("isSpecFootnoteLabel", () => {
  it("matches the bilingual two-line label the sheets actually use", () => {
    // This is the real label, English and Chinese on two lines of one cell.
    // An exact-string match found it in none of the fifteen sheets.
    expect(isSpecFootnoteLabel("Spec Footnote\n規格備註")).toBe(true);
  });

  it("tolerates the spellings and the stray spacing of hand-edited sheets", () => {
    for (const label of [
      "Spec Footnote",
      "  spec  footnote  ",
      "Spec Footnotes",
      "Spec Note",
      "Spec Notes (一行一條)",
      "規格備註",
      "規格備註 Spec Footnote",
      "規格註記",
    ]) {
      expect(isSpecFootnoteLabel(label), label).toBe(true);
    }
  });

  it("leaves the other rows of the tab alone", () => {
    for (const label of [
      "Model Name",
      "Model #",
      "Status",
      "Headline",
      "Single Overview",
      "Key Feature Lists \n (條列式功能，最多12項)",
      "DS Feature Groups",
      "Product List Tag (勾選 for products list page)",
      "Product Highlights\n(Product card item)",
      "",
    ]) {
      expect(isSpecFootnoteLabel(label), label).toBe(false);
    }
  });
});
