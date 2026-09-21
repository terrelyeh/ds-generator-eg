"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  countRows,
  filterMatrix,
  isCheckValue,
  rowDiffers,
  type SpecCategory,
} from "@/lib/compare/spec-matrix";
import { exportComparisonXlsx } from "@/lib/compare/export-xlsx";

interface CompareTableProps {
  /** Product line label — used for the export file name. */
  title: string;
  models: string[];
  categories: SpecCategory[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Highlight matching text within a cell */
function HighlightText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200/80 text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ValueCell({ value, query }: { value: string | undefined; query: string }) {
  if (isCheckValue(value)) {
    return (
      <Check
        className="h-4 w-4 text-engenius-blue"
        strokeWidth={2.75}
        aria-label="Supported"
      />
    );
  }
  if (!value || value.trim() === "") {
    return <span className="text-muted-foreground/30">—</span>;
  }
  return (
    <span className="break-words whitespace-pre-line">
      <HighlightText text={value} query={query} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Spec rows grouped under a full-width band per category. The Spec column is
 * the only sticky one and wraps instead of overflowing — the old layout pinned
 * a fixed-width Category badge column plus a Spec column at a hard-coded
 * `left: 120`, so long names spilled under their neighbours.
 */
export function CompareTable({ title, models, categories }: CompareTableProps) {
  const [query, setQuery] = useState("");
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [exporting, setExporting] = useState(false);

  const visibleModels = useMemo(
    () => models.filter((m) => !hiddenModels.has(m)),
    [models, hiddenModels]
  );

  const filtered = useMemo(
    () => filterMatrix(categories, { models: visibleModels, query, onlyDifferences }),
    [categories, visibleModels, query, onlyDifferences]
  );

  const totalRows = useMemo(() => countRows(categories), [categories]);
  const shownRows = countRows(filtered);
  const colCount = visibleModels.length + 1;

  function toggleModel(m: string) {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function toggleCategory(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportComparisonXlsx({ title, models: visibleModels, categories: filtered });
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <Input
            placeholder="Search specs, values..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Result count */}
        <span className="text-xs text-muted-foreground tabular-nums">
          {shownRows} / {totalRows} rows
        </span>

        {/* Only differences */}
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyDifferences}
            onChange={(e) => setOnlyDifferences(e.target.checked)}
            className="rounded border-border"
          />
          Only differences
        </label>

        {/* Column visibility toggle */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowColumnPicker(!showColumnPicker)}
          >
            Columns ({visibleModels.length}/{models.length})
          </Button>
          {showColumnPicker && (
            <div className="absolute left-0 top-full mt-1 z-50 w-56 max-h-[320px] overflow-y-auto rounded-lg border bg-card p-2 shadow-lg">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                Toggle Models
              </p>
              <button
                className="w-full text-left px-2 py-1 text-xs text-engenius-blue hover:bg-muted rounded mb-1"
                onClick={() => setHiddenModels(new Set())}
              >
                Show All
              </button>
              {models.map((m) => {
                const isVisible = !hiddenModels.has(m);
                return (
                  <label
                    key={m}
                    className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => toggleModel(m)}
                      className="rounded border-border"
                    />
                    <span className={isVisible ? "text-foreground" : "text-muted-foreground"}>
                      {m}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Clear filters */}
        {(query || onlyDifferences) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setQuery("");
              setOnlyDifferences(false);
            }}
          >
            Clear
          </Button>
        )}

        {/* Export */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs ml-auto gap-1.5"
          onClick={handleExport}
          disabled={exporting || shownRows === 0 || visibleModels.length === 0}
          title="Export the rows and models currently shown"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export Excel
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-240px)]">
          <table className="min-w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-muted border-b-2 border-r border-border px-3 py-2.5 text-left font-semibold w-[220px] min-w-[220px] max-w-[220px]">
                  Spec
                </th>
                {visibleModels.map((m) => (
                  <th
                    key={m}
                    className="bg-muted border-b-2 border-border px-3 py-2.5 text-left font-semibold min-w-[160px] max-w-[240px]"
                  >
                    <Link
                      href={`/product/${m}`}
                      className="text-engenius-blue hover:underline"
                    >
                      {m}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {onlyDifferences && !query
                      ? "These models share every spec."
                      : "No matching specs found."}
                  </td>
                </tr>
              ) : (
                filtered.map((cat) => {
                  const isCollapsed = collapsed.has(cat.name);
                  return (
                    <Fragment key={cat.name}>
                      <tr>
                        {/* Band cell is sticky so the label stays put while the models scroll */}
                        <td
                          colSpan={colCount}
                          className="bg-engenius-blue/[0.07] border-b border-engenius-blue/20 p-0"
                        >
                          <button
                            onClick={() => toggleCategory(cat.name)}
                            className="sticky left-0 flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-engenius-blue-dark hover:text-engenius-blue"
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${
                                isCollapsed ? "-rotate-90" : ""
                              }`}
                            />
                            <HighlightText text={cat.name} query={query} />
                            <span className="font-medium text-muted-foreground tabular-nums">
                              {cat.rows.length}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {!isCollapsed &&
                        cat.rows.map((row, i) => {
                          const differs = rowDiffers(row, visibleModels);
                          const zebra = i % 2 === 1;
                          return (
                            <tr
                              key={`${cat.name}::${row.label}`}
                              className="group"
                            >
                              <td
                                className={`sticky left-0 z-10 border-b border-r border-border/60 px-3 py-2 align-top font-medium text-foreground/80 w-[220px] min-w-[220px] max-w-[220px] break-words group-hover:bg-muted ${
                                  // Opaque on purpose: the model cells scroll underneath this one
                                  zebra ? "bg-[color-mix(in_oklab,var(--muted)_60%,var(--card))]" : "bg-card"
                                }`}
                              >
                                <div className="flex items-start gap-1.5">
                                  <span
                                    className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                                      differs ? "bg-amber-400" : "bg-transparent"
                                    }`}
                                    title={differs ? "Values differ across models" : undefined}
                                  />
                                  <HighlightText text={row.label} query={query} />
                                </div>
                              </td>
                              {visibleModels.map((m) => (
                                <td
                                  key={m}
                                  className={`border-b border-border/60 px-3 py-2 align-top min-w-[160px] max-w-[240px] group-hover:bg-engenius-blue/[0.06] ${
                                    zebra ? "bg-muted/30" : ""
                                  }`}
                                >
                                  <ValueCell value={row.values[m]} query={query} />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Values differ across the models shown
      </p>
    </div>
  );
}
