import { describe, expect, it } from "vitest";
import { leavesPage, sameContent, type LinkClick } from "./unsaved-changes";

const here = "https://ds-generator-eg.vercel.app/translations/eoc?locale=ja";
function click(extra: Partial<LinkClick>): LinkClick {
  return {
    href: "https://ds-generator-eg.vercel.app/dashboard",
    target: null,
    download: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    ...extra,
  };
}

describe("leavesPage", () => {
  it("is true for a plain click on a link to another page of the app", () => {
    // The sidebar and breadcrumbs: how the MTBF fix was lost.
    expect(leavesPage(click({}), here)).toBe(true);
    expect(leavesPage(click({ href: "https://ds-generator-eg.vercel.app/translations/eoc?locale=zh-TW" }), here)).toBe(true);
  });

  it("is true for a link off the site", () => {
    expect(leavesPage(click({ href: "https://www.engeniustech.com/" }), here)).toBe(true);
  });

  it("is false when the page stays where it is", () => {
    expect(leavesPage(click({ target: "_blank" }), here)).toBe(false); // Preview opens a tab
    expect(leavesPage(click({ metaKey: true }), here)).toBe(false);
    expect(leavesPage(click({ ctrlKey: true }), here)).toBe(false);
    expect(leavesPage(click({ shiftKey: true }), here)).toBe(false);
    expect(leavesPage(click({ button: 1 }), here)).toBe(false); // middle click
    expect(leavesPage(click({ download: true }), here)).toBe(false);
  });

  it("is false for the same page, or an anchor on it", () => {
    expect(leavesPage(click({ href: here }), here)).toBe(false);
    expect(leavesPage(click({ href: `${here}#spec-labels` }), here)).toBe(false);
  });

  it("is false for links that are not navigations at all", () => {
    expect(leavesPage(click({ href: null }), here)).toBe(false);
    expect(leavesPage(click({ href: "mailto:pm@engenius.ai" }), here)).toBe(false);
    expect(leavesPage(click({ defaultPrevented: true }), here)).toBe(false); // e.g. the disabled Preview
  });

  it("counts _self as staying in this tab", () => {
    expect(leavesPage(click({ target: "_self" }), here)).toBe(true);
  });
});

describe("sameContent", () => {
  it("ignores key order — jsonb hands objects back with their keys sorted", () => {
    // An image label as the editor built it, and as the API returned it.
    expect(sameContent([{ x: 0.2, y: 0.5, text: "LAN" }], [{ text: "LAN", x: 0.2, y: 0.5 }])).toBe(true);
  });

  it("still sees a real change, a missing item, or a reordered list", () => {
    expect(sameContent([{ x: 0.2, text: "LAN" }], [{ x: 0.2, text: "WAN" }])).toBe(false);
    expect(sameContent(["a", "b"], ["a"])).toBe(false);
    expect(sameContent(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("treats null and undefined fields alike", () => {
    expect(sameContent({ caption: null }, {})).toBe(false); // a key that is there vs not is a difference…
    expect(sameContent({ caption: undefined }, {})).toBe(true); // …but undefined is not there
    expect(sameContent(null, undefined)).toBe(true);
  });
});

