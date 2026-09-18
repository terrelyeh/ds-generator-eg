import { describe, expect, it } from "vitest";
import { translationFields } from "./product-upsert";

const full = {
  product_id: "ESG510",
  locale: "ja",
  translation_mode: "light",
  headline: "見出し",
  subtitle: null,
  overview: "  概要  ",
  features: ["一", "二"],
  spec_notes: "*注：参考値です。",
  hardware_image: null,
  qr_label: null,
  qr_url: null,
};

describe("translationFields", () => {
  it("writes every column the caller named, trimming text and storing '' as null", () => {
    expect(translationFields({ ...full, qr_label: "   " })).toEqual({
      product_id: "ESG510",
      locale: "ja",
      translation_mode: "light",
      headline: "見出し",
      subtitle: null,
      overview: "概要",
      features: ["一", "二"],
      spec_notes: "*注：参考値です。",
      hardware_image: null,
      qr_label: null,
      qr_url: null,
    });
  });

  it("leaves out a column the caller did not mention, so an upsert keeps it", () => {
    // The Preview save was exactly this body: everything but spec_notes.
    // Writing null for it deleted a footnote somebody had just translated.
    const withoutNotes: Record<string, unknown> = { ...full };
    delete withoutNotes.spec_notes;
    const fields = translationFields(withoutNotes);
    expect("spec_notes" in fields).toBe(false);
    expect(fields.overview).toBe("概要");
  });

  it("still clears a field the caller emptied on purpose", () => {
    expect(translationFields({ ...full, spec_notes: "" }).spec_notes).toBeNull();
    expect(translationFields({ ...full, spec_notes: null }).spec_notes).toBeNull();
  });

  it("does not reset an existing row's mode when the caller omits it", () => {
    const fields = translationFields({ product_id: "ESG510", locale: "ja" });
    expect(fields).toEqual({ product_id: "ESG510", locale: "ja" });
  });

  it("keeps a features array as given, and nulls a non-array", () => {
    expect(translationFields({ ...full, features: null }).features).toBeNull();
    expect(translationFields({ ...full, features: [] }).features).toEqual([]);
  });
});
