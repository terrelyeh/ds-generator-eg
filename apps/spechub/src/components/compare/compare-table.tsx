"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Download, Loader2, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  countRows,
  filterMatrix,
  isCheckValue,
  rowDiffers,
  rowKey,
  splitPinned,
  type SpecCategory,
  type SpecRow,
} from "@/lib/compare/spec-matrix";
import { exportComparisonXlsx } from "@/lib/compare/export-xlsx";

interface CompareTableProps {
  /** Product line label — used for the export file name. */
  title: string;
  models: string[];
  categories: SpecCategory[];
  /** Row keys from `?pin=`, so a shared link opens with the same rows pinned. */
  initialPinned?: string[];
}

/**
 * Pinned rows live in the sticky header, which cannot scroll on its own —
 * past this many they would crowd out the rows they are meant to be compared
 * against.
 */
const MAX_PINNED = 8;

const SPEC_COL = "w-[220px] min-w-[220px] max-w-[220px]";
const MODEL_COL = "min-w-[160px] max-w-[240px]";
/** Opaque tints: cells in sticky positions have content scrolling underneath. */
const ZEBRA_BG = "bg-[color-mix(in_oklab,var(--muted)_60%,var(--card))]";
/**
 * Pinned rows are warm on purpose: blue is already the category bands, and a
 * blue pinned block read as just another category.
 */
const PINNED_BG = "bg-[color-mix(in_oklab,#fcd34d_14%,var(--card))]";
const PINNED_BAND_BG = "bg-[color-mix(in_oklab,#fcd34d_28%,var(--card))]";

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

function SpecRowView({
  row,
  models,
  query,
  zebra,
  pinned,
  pinDisabled,
  onTogglePin,
}: {
  row: SpecRow;
  models: string[];
  query: string;
  zebra: boolean;
  pinned: boolean;
  pinDisabled: boolean;
  onTogglePin: () => void;
}) {
  const differs = rowDiffers(row, models);
  const specBg = pinned ? PINNED_BG : zebra ? ZEBRA_BG : "bg-card";
  const valueBg = pinned ? PINNED_BG : zebra ? "bg-muted/30" : "";
  return (
    <tr className="group">
      <td
        className={`sticky left-0 z-10 border-b border-r border-border/60 px-3 py-2 align-top font-medium text-foreground/80 ${SPEC_COL} break-words ${specBg} ${
          pinned ? "" : "group-hover:bg-muted"
        }`}
      >
        <div className="flex items-start gap-1.5">
          <span
            className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
              differs ? "bg-amber-400" : "bg-transparent"
            }`}
            title={differs ? "Values differ across models" : undefined}
          />
          <span className="flex-1">
            <HighlightText text={row.label} query={query} />
          </span>
          <button
            onClick={onTogglePin}
            disabled={pinDisabled}
            title={
              pinned
                ? "Unpin"
                : pinDisabled
                  ? `Up to ${MAX_PINNED} rows can be pinned`
                  : "Pin to top"
            }
            className={`-my-0.5 shrink-0 rounded p-0.5 transition-opacity disabled:cursor-not-allowed ${
              pinned
                ? "text-amber-700 hover:text-amber-900"
                : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-engenius-blue disabled:hover:text-muted-foreground"
            }`}
          >
            {pinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </td>
      {models.map((m) => (
        <td
          key={m}
          className={`border-b border-border/60 px-3 py-2 align-top ${MODEL_COL} ${valueBg} ${
            pinned ? "" : "group-hover:bg-engenius-blue/[0.06]"
          }`}
        >
          <ValueCell value={row.values[m]} query={query} />
        </td>
      ))}
    </tr>
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
export function CompareTable({
  title,
  models,
  categories,
  initialPinned = [],
}: CompareTableProps) {
  const [query, setQuery] = useState("");
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pinnedKeys, setPinnedKeys] = useState<string[]>(() =>
    initialPinned.slice(0, MAX_PINNED)
  );

  const visibleModels = useMemo(
    () => models.filter((m) => !hiddenModels.has(m)),
    [models, hiddenModels]
  );

  // Pinned rows are exempt from search and "only differences": the reader
  // chose them, so a filter should never hide them.
  const { pinned, rest } = useMemo(
    () => splitPinned(categories, pinnedKeys),
    [categories, pinnedKeys]
  );

  const filtered = useMemo(
    () => filterMatrix(rest, { models: visibleModels, query, onlyDifferences }),
    [rest, visibleModels, query, onlyDifferences]
  );

  const totalRows = useMemo(() => countRows(categories), [categories]);
  const shownRows = pinned.length + countRows(filtered);
  const pinLimitReached = pinned.length >= MAX_PINNED;
  const colCount = visibleModels.length + 1;

  function toggleModel(m: string) {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function updatePinned(next: string[]) {
    setPinnedKeys(next);
    // Keep the pins in the URL so a reload or a shared link keeps them.
    // replaceState, not the router: nothing on the server depends on it.
    const url = new URL(window.location.href);
    url.searchParams.delete("pin");
    for (const k of next) url.searchParams.append("pin", k);
    window.history.replaceState(null, "", url);
  }

  function togglePin(key: string) {
    // Start from the rows actually found, so keys from a stale link are
    // dropped here instead of lingering in the URL and the pin count.
    const current = pinned.map((r) => r.key);
    if (current.includes(key)) updatePinned(current.filter((k) => k !== key));
    else if (current.length < MAX_PINNED) updatePinned([...current, key]);
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
      await exportComparisonXlsx({ title, models: visibleModels, pinned, categories: filtered });
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

        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Values differ
        </span>

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
        {/* Tall enough to fill the viewport once the page title scrolls away */}
        <div className="overflow-auto max-h-[calc(100dvh-140px)]">
          <table className="min-w-full text-xs border-separate border-spacing-0">
            {/* The thead's own background fills the sub-pixel seams between its rows;
                without it the rows scrolling underneath ghost through the pinned block. */}
            <thead className="sticky top-0 z-20 bg-card">
              <tr>
                <th className={`sticky left-0 z-30 bg-muted border-b-2 border-r border-border px-3 py-2.5 text-left font-semibold ${SPEC_COL}`}>
                  Spec
                </th>
                {visibleModels.map((m) => (
                  <th
                    key={m}
                    className={`bg-muted border-b-2 border-border px-3 py-2.5 text-left font-semibold ${MODEL_COL}`}
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
              {pinned.length > 0 && (
                <>
                  <tr>
                    <td colSpan={colCount} className={`${PINNED_BAND_BG} border-b border-amber-400/40 p-0`}>
                      <div className="sticky left-0 flex w-max items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                        <Pin className="h-3.5 w-3.5" />
                        Pinned
                        <span className="font-medium text-muted-foreground tabular-nums">
                          {pinned.length}
                          {pinLimitReached && ` / ${MAX_PINNED} max`}
                        </span>
                        <button
                          onClick={() => updatePinned([])}
                          className="ml-1 font-medium normal-case tracking-normal text-muted-foreground hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    </td>
                  </tr>
                  {pinned.map((row) => (
                    <SpecRowView
                      key={row.key}
                      row={row}
                      models={visibleModels}
                      query={query}
                      zebra={false}
                      pinned
                      pinDisabled={false}
                      onTogglePin={() => togglePin(row.key)}
                    />
                  ))}
                  {/* Heavier rule so the pinned block reads as separate from what scrolls under it */}
                  <tr aria-hidden>
                    <td colSpan={colCount} className="h-0 p-0 border-b-2 border-amber-400/70" />
                  </tr>
                </>
              )}
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
                          const key = rowKey(cat.name, row.label);
                          return (
                            <SpecRowView
                              key={key}
                              row={row}
                              models={visibleModels}
                              query={query}
                              zebra={i % 2 === 1}
                              pinned={false}
                              pinDisabled={pinLimitReached}
                              onTogglePin={() => togglePin(key)}
                            />
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
    </div>
  );
}
