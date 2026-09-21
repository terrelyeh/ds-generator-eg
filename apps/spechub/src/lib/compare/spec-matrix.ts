/**
 * The spec-comparison matrix as the compare page shows it and exports it:
 * categories of rows, one value per model. Everything here is pure, so the
 * on-screen table and the Excel export filter the same way by construction —
 * what you see is what you download.
 */

export interface SpecRow {
  label: string;
  values: Record<string, string>;
}

export interface SpecCategory {
  name: string;
  rows: SpecRow[];
}

/**
 * The comparison sheets mark "has this feature" with a bare `V` (Cloud Camera)
 * or a `●` (Cloud AP). Rendering either as a check (and exporting it as ✓) is
 * what makes a feature row scannable.
 */
const CHECK_VALUES = new Set(["v", "✓", "✔", "●", "•"]);

export function isCheckValue(value: string | undefined): boolean {
  return CHECK_VALUES.has((value ?? "").trim().toLowerCase());
}

/** Values that mean the same thing compare equal: whitespace and case, and every spelling of the check mark. */
function normalize(value: string | undefined): string {
  if (isCheckValue(value)) return "✓";
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Whether the given models disagree on this row. A missing value counts as a
 * value of its own — "one model has storage, the others don't" is exactly the
 * difference a reader is looking for. Fewer than two models never differ.
 */
export function rowDiffers(row: SpecRow, models: string[]): boolean {
  if (models.length < 2) return false;
  const first = normalize(row.values[models[0]]);
  return models.some((m) => normalize(row.values[m]) !== first);
}

export interface MatrixFilter {
  /** The models currently shown, in column order. */
  models: string[];
  query: string;
  onlyDifferences: boolean;
}

/**
 * Narrow the matrix to what the reader asked for. A query that matches a
 * category name keeps that whole category; otherwise a row stays when its
 * label or any shown model's value contains the query. Categories left with
 * no rows are dropped rather than rendered as empty headers.
 */
export function filterMatrix(
  categories: SpecCategory[],
  { models, query, onlyDifferences }: MatrixFilter
): SpecCategory[] {
  const q = query.trim().toLowerCase();
  const out: SpecCategory[] = [];

  for (const cat of categories) {
    const categoryMatches = q !== "" && cat.name.toLowerCase().includes(q);
    const rows = cat.rows.filter((row) => {
      if (onlyDifferences && !rowDiffers(row, models)) return false;
      if (q === "" || categoryMatches) return true;
      if (row.label.toLowerCase().includes(q)) return true;
      return models.some((m) => (row.values[m] ?? "").toLowerCase().includes(q));
    });
    if (rows.length > 0) out.push({ name: cat.name, rows });
  }

  return out;
}

export function countRows(categories: SpecCategory[]): number {
  return categories.reduce((n, c) => n + c.rows.length, 0);
}

// ---------------------------------------------------------------------------
// Pinned rows
// ---------------------------------------------------------------------------

/**
 * A row's identity across renders and in the URL (`?pin=Optics::Resolution`).
 * The category is part of it because labels are only unique within one.
 */
export function rowKey(category: string, label: string): string {
  return `${category}::${label}`;
}

export interface PinnedRow extends SpecRow {
  key: string;
  category: string;
}

/**
 * Lift the pinned rows out of the matrix, in the order they were pinned.
 * They leave their category so no row shows twice; keys that no longer match
 * a row (a stale shared link, a renamed spec) are simply dropped.
 */
export function splitPinned(
  categories: SpecCategory[],
  pinnedKeys: string[]
): { pinned: PinnedRow[]; rest: SpecCategory[] } {
  if (pinnedKeys.length === 0) return { pinned: [], rest: categories };

  const wanted = new Set(pinnedKeys);
  const found = new Map<string, PinnedRow>();
  const rest: SpecCategory[] = [];

  for (const cat of categories) {
    const rows: SpecRow[] = [];
    for (const row of cat.rows) {
      const key = rowKey(cat.name, row.label);
      if (wanted.has(key)) found.set(key, { ...row, key, category: cat.name });
      else rows.push(row);
    }
    if (rows.length > 0) rest.push({ name: cat.name, rows });
  }

  const pinned = pinnedKeys.flatMap((k) => found.get(k) ?? []);
  return { pinned, rest };
}
