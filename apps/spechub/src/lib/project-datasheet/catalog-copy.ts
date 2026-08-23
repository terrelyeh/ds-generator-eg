/**
 * Carrying a catalogue product's cover copy onto a project datasheet.
 *
 * The bug this exists to fix: `seed-from-product` copied `overview` and
 * `features` onto the MODEL row, and nothing prints from there. The cover
 * reads `project_datasheets.overview` and the benefits page reads
 * `project_datasheets.features`; the only reader of the model's copy is the
 * leak detector, which checks whether a hidden spec surfaces in prose. So
 * seeding from a shipping product wrote the words down and then threw them
 * away, leaving a blank cover and no benefits page — while the guide
 * promised "specs, copy and photos come across together".
 *
 * Separated from the route so the decision is testable without a database.
 * The judgement is all in here; the route just reads a row and writes one.
 */

export interface CatalogSource {
  headline: string | null;
  overview: string | null;
  features: unknown;
  category: string | null;
}

export interface CoverFields {
  headline: string | null;
  series_name: string | null;
  category_label: string | null;
  overview: string | null;
  features: unknown;
}

export interface SeedResult {
  patch: Record<string, unknown>;
  /** the fields filled, named as they appear on screen */
  filled: string[];
}

/**
 * BLANKS ONLY, and that is the whole safety story.
 *
 * Adding a second model must not overwrite the headline somebody wrote for
 * the first, and a document that has been edited for a week must survive a
 * column being added to it.
 */
export function coverPatchFromCatalog(
  doc: CoverFields,
  product: CatalogSource,
  modelName: string,
): SeedResult {
  const patch: Record<string, unknown> = {};
  const filled: string[] = [];

  const fill = (field: string, current: string | null, value: string | null, label: string) => {
    if (current?.trim() || !value?.trim()) return;
    patch[field] = value.trim();
    filled.push(label);
  };

  fill("headline", doc.headline, product.headline, "主標");
  fill("series_name", doc.series_name, modelName, "副標");
  fill("category_label", doc.category_label, product.category, "分類標籤");
  fill("overview", doc.overview, product.overview, "Overview");

  // The catalogue keeps a flat list; the page wants titled blocks. One block
  // holding the list verbatim is the honest transfer — inventing themes to
  // split it across would be writing, and writing is what the AI drafter is
  // for. Whoever restructures it can see exactly what the catalogue said.
  const bullets = (Array.isArray(product.features) ? product.features : [])
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    .map((f) => f.trim());
  const hasFeatures = Array.isArray(doc.features) && doc.features.length > 0;
  if (!hasFeatures && bullets.length > 0) {
    patch.features = [{ title: "Key Features", bullets }];
    filled.push("Features & Benefits");
  }

  return { patch, filled };
}
