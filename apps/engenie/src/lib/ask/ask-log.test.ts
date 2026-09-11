import { describe, expect, it } from "vitest";
import { citedSources, cleanVisitorId, sourceLabel, topSimilarity } from "./ask-log";

const docs = [
  { title: "ECW536 Datasheet", source_type: "product_spec", source_id: "ecw536" },
  { title: "ECW536 Datasheet", source_type: "product_spec", source_id: "ecw536" },
  { title: "Cloud 手冊 › VPN", source_type: "gitbook", source_id: "vpn" },
];

describe("citedSources", () => {
  it("lists each cited source once, in citation order", () => {
    expect(citedSources("VPN 可以 [3]。規格見 [1]，另見 [2]。", docs).map((s) => s.source_id)).toEqual(["vpn", "ecw536"]);
  });

  it("understands [Source N] and ignores numbers past the retrieved set", () => {
    expect(citedSources("見 [Source 3] 與 [9]", docs).map((s) => s.source_id)).toEqual(["vpn"]);
  });

  it("returns nothing for an answer without citations", () => {
    expect(citedSources("沒有引用。", docs)).toEqual([]);
  });
});

describe("cleanVisitorId", () => {
  it("keeps a random-looking id", () => {
    expect(cleanVisitorId("3f2a9c1e-7b44-4d2a-9e0f-5c1d2b3a4e5f")).toBe("3f2a9c1e-7b44-4d2a-9e0f-5c1d2b3a4e5f");
  });

  it("drops anything that isn't one", () => {
    for (const v of ["someone@engenius.com", "short", "x".repeat(65), "<b>hi</b>", 42, null, undefined]) {
      expect(cleanVisitorId(v)).toBeNull();
    }
  });
});

describe("topSimilarity", () => {
  it("is the best score, rounded to two places", () => {
    expect(topSimilarity([{ similarity: 0.4123 }, { similarity: 0.6789 }])).toBe(0.68);
  });

  it("is null when nothing was retrieved", () => {
    expect(topSimilarity([])).toBeNull();
  });
});

describe("sourceLabel", () => {
  it("names the document rather than the section it came from", () => {
    expect(sourceLabel({ title: "Product Positioning:", source_type: "google_doc", source_id: "x/ecw536s-message-guide", metadata: { doc_title: "Message Guide_ECW536S" } })).toBe("Message Guide_ECW536S");
    expect(sourceLabel({ title: "Configuring Port Forwarding", source_type: "helpcenter", source_id: "9964642", metadata: { article_title: "NAT / Port Forwarding" } })).toBe("NAT / Port Forwarding");
    expect(sourceLabel({ title: "E5-NA08W — Technical Specifications", source_type: "product_spec", source_id: "E5-NA08W" })).toBe("E5-NA08W");
  });

  it("falls back to the chunk's own title", () => {
    expect(sourceLabel({ title: "7. Handling Trial Licenses", source_type: "support", source_id: "INTERCOM-X", metadata: {} })).toBe("7. Handling Trial Licenses");
    expect(sourceLabel({ title: "Overview", source_type: "google_doc", source_id: "y", metadata: null })).toBe("Overview");
  });
});
