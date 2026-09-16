import { describe, it, expect } from "vitest";
import {
  checkSpecNoteMarkers,
  estimateSpecNotesHeight,
  markersInNotes,
  markersInValues,
  parseSpecNotes,
  resolveSpecNotes,
} from "./spec-notes";

describe("parseSpecNotes", () => {
  it("splits a cell into one note per line and keeps the markers", () => {
    expect(parseSpecNotes("*Note: estimates only.\n**Wi-Fi 7 needs a Wi-Fi 7 client.")).toEqual([
      "*Note: estimates only.",
      "**Wi-Fi 7 needs a Wi-Fi 7 client.",
    ]);
  });

  it("drops blank lines and trims, so a stray newline in the sheet costs nothing", () => {
    expect(parseSpecNotes("  *One  \n\n\n  **Two\n ")).toEqual(["*One", "**Two"]);
  });

  it("treats empty and null as no notes", () => {
    expect(parseSpecNotes("")).toEqual([]);
    expect(parseSpecNotes(null)).toEqual([]);
    expect(parseSpecNotes("   \n  ")).toEqual([]);
  });
});

describe("resolveSpecNotes", () => {
  const line = { lineFootnote: "*Line note", lineFootnoteTranslations: { ja: "*ラインの注記" } };

  it("prefers the product's own notes over the line's", () => {
    expect(resolveSpecNotes({ ...line, productNotes: "*Mine" })).toEqual(["*Mine"]);
  });

  it("falls back to the line footnote when the product has none", () => {
    expect(resolveSpecNotes({ ...line })).toEqual(["*Line note"]);
  });

  it("uses the locale's translation when there is one", () => {
    expect(resolveSpecNotes({ ...line, productNotes: "*Mine", translatedNotes: "*私の", locale: "ja" })).toEqual(["*私の"]);
    expect(resolveSpecNotes({ ...line, locale: "ja" })).toEqual(["*ラインの注記"]);
  });

  it("falls back to English rather than printing nothing when a locale is untranslated", () => {
    expect(resolveSpecNotes({ ...line, productNotes: "*Mine", locale: "zh-TW" })).toEqual(["*Mine"]);
  });

  it("does not stack the product's notes on top of the line's", () => {
    expect(resolveSpecNotes({ ...line, productNotes: "*Mine\n**Also mine" })).toEqual(["*Mine", "**Also mine"]);
  });

  it("is empty when nothing is set anywhere", () => {
    expect(resolveSpecNotes({})).toEqual([]);
    expect(resolveSpecNotes({ productNotes: "", lineFootnote: "" })).toEqual([]);
  });
});

describe("estimateSpecNotesHeight", () => {
  it("is 0 with no notes, so pages that have none keep their full budget", () => {
    expect(estimateSpecNotesHeight([])).toBe(0);
  });

  it("counts the block margin plus one line for a short note", () => {
    expect(estimateSpecNotesHeight(["*Short"])).toBe(16 + 11);
  });

  it("grows with wrapped lines", () => {
    const long = "*Note: " + "performance figures are estimates for reference only. ".repeat(4);
    const height = estimateSpecNotesHeight([long]);
    expect(height).toBeGreaterThan(16 + 2 * 11);
    expect(height).toBe(16 + Math.ceil(long.length / 110) * 11);
  });

  it("counts CJK as double width — a Japanese note of the same length is taller", () => {
    const en = "a".repeat(120);
    const ja = "あ".repeat(120);
    expect(estimateSpecNotesHeight([ja])).toBeGreaterThan(estimateSpecNotesHeight([en]));
  });

  it("adds up several notes", () => {
    expect(estimateSpecNotesHeight(["*One", "**Two", "***Three"])).toBe(16 + 3 * 11);
  });
});

describe("marker checking", () => {
  it("reads the marker each note opens with", () => {
    expect(markersInNotes(["* Estimates only.", "** Needs a Wi-Fi 7 client.", "No marker here"])).toEqual(["*", "**"]);
  });

  it("finds markers attached to the end of a spec value", () => {
    expect(markersInValues(["6.8G*", "1.5G*", "700 M**", "2 x 2.5GbE"])).toEqual(["*", "**"]);
  });

  it("does NOT read numbers in prose as markers", () => {
    // The check's first version called 34 Cloud APs broken over these.
    const values = [
      "Four(4) spatial stream Single User (SU) MIMO for up to 1,400 Mbps",
      "Two(2) spatial streams SU-MIMO for 2.4GHz and two(2) streams for 5GHz",
      "1 x 2.5GE Port (PoE+)\n1 x DC Jack",
    ];
    expect(markersInValues(values)).toEqual([]);
  });

  it("pairs up what the values use with what the notes explain", () => {
    expect(
      checkSpecNoteMarkers({ notes: ["* Estimates only.", "** Syslog."], values: ["6.8G*", "logs**"] }),
    ).toEqual({ valuesWithoutNote: [], notesWithoutValue: [] });
  });

  it("flags a marked value with nothing to explain it", () => {
    const result = checkSpecNoteMarkers({ notes: ["* Estimates only."], values: ["6.8G*", "logs**"] });
    expect(result.valuesWithoutNote).toEqual(["**"]);
    expect(result.notesWithoutValue).toEqual([]);
  });

  it("flags a note no value points at", () => {
    const result = checkSpecNoteMarkers({ notes: ["* Estimates only.", "** Syslog."], values: ["6.8G*"] });
    expect(result.valuesWithoutNote).toEqual([]);
    expect(result.notesWithoutValue).toEqual(["**"]);
  });

  it("says nothing when a product has neither", () => {
    expect(checkSpecNoteMarkers({ notes: [], values: ["2 x 2.5GbE", "N/A"] })).toEqual({
      valuesWithoutNote: [],
      notesWithoutValue: [],
    });
  });
});
