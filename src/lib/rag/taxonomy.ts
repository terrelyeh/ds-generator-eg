/**
 * Unified taxonomy metadata for the RAG knowledge base.
 *
 * All source types (product_spec, gitbook, helpcenter, google_doc, ...) store
 * these fields in `documents.metadata` so RAG queries can be scoped by
 * Solution > Product Line > Model.
 *
 * Semantics:
 *   solution: "cloud"         → belongs to EnGenius Cloud solution
 *   solution: null            → cross-solution global content (e.g. company FAQ)
 *   product_lines: ["Cloud Camera"]  → scoped to Cloud Camera
 *   product_lines: []         → applies to the ENTIRE solution (all lines)
 *   models: ["ECC500"]        → scoped to a specific model
 *   models: []                → product-line-level (no specific model)
 *
 * RAG filter rule: when user asks about Cloud Camera, we include rows where
 * `product_lines` contains "Cloud Camera" OR `product_lines` is empty (the
 * doc applies to the whole solution and therefore to Camera too).
 */
export interface TaxonomyMeta {
  /** Solution slug from `solutions.slug`, e.g. "cloud". Null = global. */
  solution: string | null;
  /** Product line names from `product_lines.name`, e.g. ["Cloud Camera"]. */
  product_lines: string[];
  /** Model names from `products.model_name`, e.g. ["ECC500"]. */
  models: string[];
}

/** Empty taxonomy = solution-wide / global (legacy fallback). */
export const EMPTY_TAXONOMY: TaxonomyMeta = {
  solution: null,
  product_lines: [],
  models: [],
};

/**
 * Normalize a partial taxonomy input to a full TaxonomyMeta.
 * Missing arrays become [], missing solution becomes null.
 */
export function normalizeTaxonomy(input?: Partial<TaxonomyMeta> | null): TaxonomyMeta {
  if (!input) return { ...EMPTY_TAXONOMY };
  return {
    solution: input.solution ?? null,
    product_lines: Array.isArray(input.product_lines) ? [...input.product_lines] : [],
    models: Array.isArray(input.models) ? [...input.models] : [],
  };
}

/**
 * Check whether a document matches a query taxonomy filter, including the
 * "empty product_lines = applies to whole solution" inheritance rule.
 */
export function matchesTaxonomyFilter(
  docMeta: Partial<TaxonomyMeta>,
  filter: Partial<TaxonomyMeta>
): boolean {
  // Solution filter: if the filter specifies a solution, the doc must either
  // be in that solution or be global (solution === null).
  if (filter.solution) {
    if (docMeta.solution && docMeta.solution !== filter.solution) return false;
  }

  // Product line filter: doc matches if EITHER
  //   - the doc has NO product_lines (applies to whole solution)
  //   - OR the doc's product_lines overlaps with the filter's lines
  if (filter.product_lines && filter.product_lines.length > 0) {
    const docLines = docMeta.product_lines ?? [];
    if (docLines.length > 0) {
      const overlap = docLines.some((l) => filter.product_lines!.includes(l));
      if (!overlap) return false;
    }
    // docLines empty → passes (solution-level inheritance)
  }

  // Model filter: doc matches if EITHER
  //   - the doc has NO models (product-line-level content)
  //   - OR the doc's models overlaps with the filter's models
  if (filter.models && filter.models.length > 0) {
    const docModels = docMeta.models ?? [];
    if (docModels.length > 0) {
      const overlap = docModels.some((m) => filter.models!.includes(m));
      if (!overlap) return false;
    }
  }

  return true;
}

/**
 * Extract TaxonomyMeta from a document's metadata JSONB blob.
 * Handles legacy docs that don't have taxonomy fields yet.
 */
export function extractTaxonomy(metadata: Record<string, unknown> | null | undefined): TaxonomyMeta {
  if (!metadata) return { ...EMPTY_TAXONOMY };
  return {
    solution: typeof metadata.solution === "string" ? metadata.solution : null,
    product_lines: Array.isArray(metadata.product_lines)
      ? (metadata.product_lines as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    models: Array.isArray(metadata.models)
      ? (metadata.models as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
  };
}
