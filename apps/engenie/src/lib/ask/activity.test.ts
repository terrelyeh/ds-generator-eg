import { describe, expect, it } from "vitest";
import { groupSources, sourceHref } from "./activity";

const s = (source_type: string, source_id: string, title: string, source_url: string | null = null) => ({
  source_type,
  source_id,
  title,
  source_url,
});

describe("groupSources", () => {
  it("folds chunks of the same section into one item, keeping every citation number", () => {
    const groups = groupSources([
      s("internal_doc", "craft-ai-srs/Craft-AI-SRS-v2.0", "4.5 Change Ticket"),
      s("gitbook", "esg620/vpn", "Site-to-site VPN"),
      s("internal_doc", "craft-ai-srs/Craft-AI-SRS-v2.0", "4.5 Change Ticket"),
    ]);
    expect(groups.map((g) => [g.title, g.citations])).toEqual([
      ["4.5 Change Ticket", [1, 3]],
      ["Site-to-site VPN", [2]],
    ]);
  });

  it("keeps different sections of the same document apart", () => {
    expect(groupSources([s("internal_doc", "doc", "4.4 Memory"), s("internal_doc", "doc", "4.5 Change Ticket")])).toHaveLength(2);
  });

  it("falls back to the source id when a chunk has no title", () => {
    expect(groupSources([s("web", "example.com/x", "")])[0].title).toBe("example.com/x");
  });

  it("handles no sources", () => {
    expect(groupSources(undefined)).toEqual([]);
    expect(groupSources([])).toEqual([]);
  });
});

describe("sourceHref", () => {
  it("links external http(s) everywhere", () => {
    expect(sourceHref("https://doc.engenius.ai/x", "gitbook", { allowRelative: false })).toBe("https://doc.engenius.ai/x");
  });

  it("links app paths only where the reader has an EnGenie login", () => {
    // Workspace, widget and extension readers hold a workspace token, not a
    // session — /knowledge/doc would bounce them to sign-in.
    const url = "/knowledge/doc/internal_doc/craft-ai-srs/x";
    expect(sourceHref(url, "internal_doc", { allowRelative: true })).toBe(url);
    expect(sourceHref(url, "internal_doc", { allowRelative: false })).toBeNull();
  });

  it("never links product_spec, protocol-relative URLs, or nothing", () => {
    expect(sourceHref("/product/ECW536", "product_spec", { allowRelative: true })).toBeNull();
    expect(sourceHref("//evil.example/x", "web", { allowRelative: true })).toBeNull();
    expect(sourceHref(null, "web", { allowRelative: true })).toBeNull();
  });
});
