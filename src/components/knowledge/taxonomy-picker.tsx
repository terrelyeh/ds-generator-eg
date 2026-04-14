"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Unified taxonomy data shape served by /api/taxonomy.
 */
export interface TaxonomyData {
  solutions: { slug: string; label: string; sort_order: number }[];
  product_lines: {
    name: string;
    label: string;
    category: string;
    solution_slug: string | null;
  }[];
  products: {
    model_name: string;
    product_line_name: string | null;
    status: string;
  }[];
}

export interface TaxonomyValue {
  solution: string | null;       // solutions.slug, or "__global__" for cross-solution
  product_lines: string[];       // product_lines.name[] — empty = whole solution
  models: string[];              // products.model_name[] — empty = line-level
}

export const GLOBAL_SOLUTION_SLUG = "__global__";

export const EMPTY_TAXONOMY_VALUE: TaxonomyValue = {
  solution: null,
  product_lines: [],
  models: [],
};

interface TaxonomyPickerProps {
  value: TaxonomyValue;
  onChange: (value: TaxonomyValue) => void;
  /** If true, show a "Global (cross-solution)" option in the Solution dropdown */
  allowGlobal?: boolean;
  /** If true, Solution is required (disables submit until picked) */
  required?: boolean;
  disabled?: boolean;
}

/**
 * Fetches the taxonomy once and caches in module-scope (taxonomy rarely changes).
 */
let taxonomyCache: TaxonomyData | null = null;
let taxonomyPromise: Promise<TaxonomyData> | null = null;

async function fetchTaxonomy(): Promise<TaxonomyData> {
  if (taxonomyCache) return taxonomyCache;
  if (taxonomyPromise) return taxonomyPromise;
  taxonomyPromise = fetch("/api/taxonomy")
    .then((r) => r.json())
    .then((d) => {
      taxonomyCache = {
        solutions: d.solutions ?? [],
        product_lines: d.product_lines ?? [],
        products: d.products ?? [],
      };
      return taxonomyCache;
    });
  return taxonomyPromise;
}

export function TaxonomyPicker({
  value,
  onChange,
  allowGlobal = false,
  required = true,
  disabled = false,
}: TaxonomyPickerProps) {
  const [data, setData] = useState<TaxonomyData | null>(taxonomyCache);

  useEffect(() => {
    if (!data) {
      fetchTaxonomy().then(setData).catch(() => setData(null));
    }
  }, [data]);

  // Filter product_lines by the chosen solution
  const filteredLines = useMemo(() => {
    if (!data) return [];
    if (!value.solution || value.solution === GLOBAL_SOLUTION_SLUG) return [];
    return data.product_lines.filter((pl) => pl.solution_slug === value.solution);
  }, [data, value.solution]);

  // Filter products by the chosen product_lines (if none chosen, show nothing)
  const filteredProducts = useMemo(() => {
    if (!data || value.product_lines.length === 0) return [];
    const lineSet = new Set(value.product_lines);
    return data.products.filter((p) => p.product_line_name && lineSet.has(p.product_line_name));
  }, [data, value.product_lines]);

  const appliesToWholeSolution = value.product_lines.length === 0 && value.solution && value.solution !== GLOBAL_SOLUTION_SLUG;

  function toggleProductLine(name: string) {
    const next = value.product_lines.includes(name)
      ? value.product_lines.filter((n) => n !== name)
      : [...value.product_lines, name];
    // Clear models that are no longer valid
    const nextModels = value.models.filter((m) => {
      const prod = data?.products.find((p) => p.model_name === m);
      return prod && next.includes(prod.product_line_name ?? "");
    });
    onChange({ ...value, product_lines: next, models: nextModels });
  }

  function toggleModel(name: string) {
    const next = value.models.includes(name)
      ? value.models.filter((n) => n !== name)
      : [...value.models, name];
    onChange({ ...value, models: next });
  }

  function setSolution(slug: string) {
    // Changing solution resets lines and models
    onChange({
      solution: slug || null,
      product_lines: [],
      models: [],
    });
  }

  function setAppliesToWholeSolution() {
    onChange({ ...value, product_lines: [], models: [] });
  }

  if (!data) {
    return <div className="text-xs text-muted-foreground">Loading taxonomy…</div>;
  }

  return (
    <div className="space-y-3">
      {/* Solution */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Solution {required && <span className="text-red-500">*</span>}
        </label>
        <select
          value={value.solution ?? ""}
          onChange={(e) => setSolution(e.target.value)}
          disabled={disabled}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50 bg-background"
        >
          <option value="">— Select solution —</option>
          {data.solutions.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label}
            </option>
          ))}
          {allowGlobal && (
            <option value={GLOBAL_SOLUTION_SLUG}>🌐 Global (cross-solution)</option>
          )}
        </select>
      </div>

      {/* Product Line */}
      {value.solution && value.solution !== GLOBAL_SOLUTION_SLUG && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Product Line(s)
          </label>
          <div className="rounded-md border bg-background divide-y max-h-48 overflow-y-auto">
            <label className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer">
              <input
                type="checkbox"
                checked={!!appliesToWholeSolution}
                onChange={setAppliesToWholeSolution}
                disabled={disabled}
              />
              <span className="font-medium text-engenius-blue">
                Applies to entire solution
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">(all lines)</span>
            </label>
            {filteredLines.map((pl) => {
              const checked = value.product_lines.includes(pl.name);
              return (
                <label
                  key={pl.name}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProductLine(pl.name)}
                    disabled={disabled}
                  />
                  <span>{pl.label || pl.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{pl.category}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Model */}
      {value.product_lines.length > 0 && filteredProducts.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Model(s) <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <div className="rounded-md border bg-background divide-y max-h-40 overflow-y-auto">
            {filteredProducts.map((p) => {
              const checked = value.models.includes(p.model_name);
              return (
                <label
                  key={p.model_name}
                  className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModel(p.model_name)}
                    disabled={disabled}
                  />
                  <span className="font-mono">{p.model_name}</span>
                  {p.status && p.status !== "active" && (
                    <span className="ml-auto text-[10px] uppercase text-muted-foreground">{p.status}</span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            Leave empty to apply to all models in the selected product line(s).
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline badges for displaying taxonomy on source rows.
 */
export function TaxonomyBadges({
  solution,
  product_lines,
  models,
  solutionLabels,
}: {
  solution: string | null;
  product_lines: string[];
  models: string[];
  solutionLabels?: Record<string, string>;
}) {
  if (!solution && product_lines.length === 0 && models.length === 0) {
    return <span className="text-[10px] text-muted-foreground/50 italic">untagged</span>;
  }

  const solLabel = solution && solutionLabels?.[solution] ? solutionLabels[solution] : solution;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {solution && (
        <span className="inline-flex items-center rounded bg-engenius-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-engenius-blue">
          {solLabel}
        </span>
      )}
      {product_lines.length === 0 && solution && (
        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          whole solution
        </span>
      )}
      {product_lines.map((pl) => (
        <span
          key={pl}
          className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {pl}
        </span>
      ))}
      {models.map((m) => (
        <span
          key={m}
          className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-mono text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {m}
        </span>
      ))}
    </div>
  );
}
