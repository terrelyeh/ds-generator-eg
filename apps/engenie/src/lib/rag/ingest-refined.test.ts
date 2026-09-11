import { describe, expect, it } from "vitest";
import { imageUrlsForChunk } from "./ingest-refined";

describe("imageUrlsForChunk", () => {
  const images = [
    { marker: "（圖：Stack overview）", url: "/api/knowledge-assets/internal_doc/p/stack.svg" },
    { marker: "（圖：Ticket lifecycle）", url: "/api/knowledge-assets/internal_doc/p/ticket.svg" },
  ];

  it("attaches the images whose marker the chunk contains", () => {
    // The marker sits where the diagram sat, so the chunk holding it is the
    // section the diagram illustrates.
    expect(imageUrlsForChunk("## 4.5 Change Ticket\n\n（圖：Ticket lifecycle）\n\nbody", images)).toEqual([
      "/api/knowledge-assets/internal_doc/p/ticket.svg",
    ]);
  });

  it("returns nothing for a chunk without markers, or an article without images", () => {
    expect(imageUrlsForChunk("plain text", images)).toEqual([]);
    expect(imageUrlsForChunk("（圖：Stack overview）", undefined)).toEqual([]);
  });

  it("dedupes a URL declared twice", () => {
    expect(imageUrlsForChunk("（圖：Stack overview）", [images[0], { ...images[0] }])).toEqual([images[0].url]);
  });
});
