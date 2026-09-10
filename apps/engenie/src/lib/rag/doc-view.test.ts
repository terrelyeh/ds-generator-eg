import { describe, expect, it } from "vitest";
import { docTitle, reconstructFromChunks, stripChunkPrefix, viewerPath } from "./doc-view";

const chunk = (i: number, content: string, extra: Partial<{ title: string; metadata: Record<string, unknown> }> = {}) => ({
  chunk_index: i,
  title: extra.title ?? null,
  content,
  metadata: extra.metadata ?? null,
});

describe("viewerPath", () => {
  it("keeps a path-shaped source id readable as path segments", () => {
    expect(viewerPath("internal_doc", "craft-ai-srs/references/01/persona")).toBe(
      "/knowledge/doc/internal_doc/craft-ai-srs/references/01/persona",
    );
  });

  it("encodes each segment without eating the separators", () => {
    // A slash must stay a slash (the catch-all route rebuilds the id from
    // segments); anything else in a segment gets escaped.
    expect(viewerPath("support", "INTERCOM-CLUSTER-VLAN")).toBe("/knowledge/doc/support/INTERCOM-CLUSTER-VLAN");
    expect(viewerPath("internal_doc", "pkg/a b/c")).toBe("/knowledge/doc/internal_doc/pkg/a%20b/c");
  });

  it("drops empty segments so an id never yields a double slash", () => {
    expect(viewerPath("text_snippet", "/snippet-x/")).toBe("/knowledge/doc/text_snippet/snippet-x");
  });
});

describe("stripChunkPrefix", () => {
  it("removes the [label > title] header chunk.ts adds", () => {
    expect(stripChunkPrefix("[Craft AI SRS v2.0 > Skill: networks]\n\n# Skill: networks\n\nbody")).toBe(
      "# Skill: networks\n\nbody",
    );
  });

  it("leaves a leading markdown link alone", () => {
    // "[text](url)" at the top of a document is content, not a prefix.
    const md = "[see the contract](https://x.example)\n\nbody";
    expect(stripChunkPrefix(md)).toBe(md);
  });
});

describe("reconstructFromChunks", () => {
  it("joins chunks in index order with prefixes stripped", () => {
    const chunks = [
      chunk(1, "[P > T]\n\nsecond"),
      chunk(0, "[P > T]\n\nfirst"),
      chunk(2, "[P > T]\n\nthird"),
    ];
    expect(reconstructFromChunks(chunks)).toBe("first\n\nsecond\n\nthird");
  });

  it("collapses a chunk repeated verbatim", () => {
    const chunks = [chunk(0, "[P > T]\n\nsame"), chunk(1, "[P > T]\n\nsame"), chunk(2, "[P > T]\n\nother")];
    expect(reconstructFromChunks(chunks)).toBe("same\n\nother");
  });

  it("skips chunks that are nothing but a prefix", () => {
    const chunks = [chunk(0, "[P > T]\n\nreal"), chunk(1, "[P > T]\n\n   ")];
    expect(reconstructFromChunks(chunks)).toBe("real");
  });
});

describe("docTitle", () => {
  it("prefers the ingest-time display title over the chunk title", () => {
    // Chunk titles are section headings ("4.5 Change Ticket"); the document is
    // the thing being opened, so its own title wins.
    const chunks = [chunk(0, "x", { title: "4.5 Change Ticket", metadata: { article_title: "Craft AI SRS" } })];
    expect(docTitle(chunks, "craft-ai-srs/Craft-AI-SRS-v2.0")).toBe("Craft AI SRS");
  });

  it("falls back to chunk 0's title, then to the id", () => {
    expect(docTitle([chunk(1, "x", { title: "Section B" }), chunk(0, "x", { title: "Section A" })], "id")).toBe("Section A");
    expect(docTitle([chunk(0, "x")], "some/source-id")).toBe("some/source-id");
  });
});
