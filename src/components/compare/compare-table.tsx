"use client";

import { useState, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryData {
  name: string;
  rows: { label: string; values: Record<string, string> }[];
}

/** Flat row for TanStack Table */
interface SpecRow {
  category: string;
  label: string;
  [model: string]: string; // dynamic model columns
}

interface CompareTableProps {
  models: string[];
  categories: CategoryData[];
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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CompareTable({ models, categories }: CompareTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Flatten categories into rows
  const data = useMemo<SpecRow[]>(() => {
    const rows: SpecRow[] = [];
    for (const cat of categories) {
      for (const row of cat.rows) {
        const specRow: SpecRow = {
          category: cat.name,
          label: row.label,
        };
        for (const m of models) {
          specRow[m] = row.values[m] ?? "";
        }
        rows.push(specRow);
      }
    }
    return rows;
  }, [categories, models]);

  // Build columns
  const columns = useMemo<ColumnDef<SpecRow>[]>(() => {
    const cols: ColumnDef<SpecRow>[] = [
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ getValue }) => (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 font-semibold uppercase tracking-wider border-engenius-blue/30 text-engenius-blue bg-engenius-blue/5 whitespace-nowrap"
          >
            {getValue<string>()}
          </Badge>
        ),
        enableSorting: true,
        size: 120,
      },
      {
        accessorKey: "label",
        header: "Spec",
        cell: ({ getValue }) => (
          <span className="font-medium text-muted-foreground whitespace-nowrap">
            <HighlightText text={getValue<string>()} query={globalFilter} />
          </span>
        ),
        enableSorting: true,
        size: 180,
      },
      ...models.map<ColumnDef<SpecRow>>((model) => ({
        accessorKey: model,
        header: () => (
          <Link
            href={`/product/${model}`}
            className="text-engenius-blue hover:underline font-semibold"
          >
            {model}
          </Link>
        ),
        cell: ({ getValue }) => {
          const val = getValue<string>();
          if (!val) return <span className="text-muted-foreground/25">—</span>;
          return (
            <span className="break-words">
              <HighlightText text={val} query={globalFilter} />
            </span>
          );
        },
        enableSorting: true,
        size: 140,
      })),
    ];
    return cols;
  }, [models, globalFilter]);

  // Custom global filter: search across label + all model values
  const globalFilterFn = useMemo(
    () =>
      (
        row: { getValue: (id: string) => unknown },
        _columnId: string,
        filterValue: string
      ) => {
        if (!filterValue) return true;
        const q = filterValue.toLowerCase();
        const label = String(row.getValue("label") ?? "").toLowerCase();
        if (label.includes(q)) return true;
        const cat = String(row.getValue("category") ?? "").toLowerCase();
        if (cat.includes(q)) return true;
        for (const m of models) {
          const val = String(row.getValue(m) ?? "").toLowerCase();
          if (val.includes(q)) return true;
        }
        return false;
      },
    [models]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      columnFilters,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const visibleRows = table.getRowModel().rows;

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
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Result count */}
        <span className="text-xs text-muted-foreground tabular-nums">
          {visibleRows.length} / {data.length} rows
        </span>

        {/* Column visibility toggle */}
        <div className="relative" ref={pickerRef}>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowColumnPicker(!showColumnPicker)}
          >
            Columns ({models.length - Object.values(columnVisibility).filter((v) => v === false).length}/{models.length})
          </Button>
          {showColumnPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-[320px] overflow-y-auto rounded-lg border bg-card p-2 shadow-lg">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                Toggle Models
              </p>
              <button
                className="w-full text-left px-2 py-1 text-xs text-engenius-blue hover:bg-muted rounded mb-1"
                onClick={() => {
                  const allVisible: VisibilityState = {};
                  models.forEach((m) => (allVisible[m] = true));
                  setColumnVisibility(allVisible);
                }}
              >
                Show All
              </button>
              {models.map((m) => {
                const isVisible = columnVisibility[m] !== false;
                return (
                  <label
                    key={m}
                    className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          [m]: !isVisible,
                        }))
                      }
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
        {(globalFilter || sorting.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setGlobalFilter("");
              setSorting([]);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b bg-muted">
                  {headerGroup.headers.map((header, idx) => {
                    const isSorted = header.column.getIsSorted();
                    const isPinned = idx <= 1; // pin Category + Spec columns
                    return (
                      <th
                        key={header.id}
                        className={`px-3 py-2.5 text-left font-semibold select-none transition-colors ${
                          isPinned
                            ? "sticky z-20 bg-muted"
                            : "bg-muted"
                        } ${
                          header.column.getCanSort()
                            ? "cursor-pointer hover:text-engenius-blue"
                            : ""
                        }`}
                        style={{
                          left: isPinned
                            ? idx === 0
                              ? 0
                              : 120
                            : undefined,
                          minWidth: header.column.getSize(),
                          maxWidth: idx <= 1 ? header.column.getSize() : 200,
                        }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <span className="text-[10px] ml-0.5">
                              {isSorted === "asc"
                                ? "↑"
                                : isSorted === "desc"
                                  ? "↓"
                                  : "↕"}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    No matching specs found.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    {row.getVisibleCells().map((c, idx) => {
                      const isPinned = idx <= 1;
                      return (
                        <td
                          key={c.id}
                          className={`px-3 py-1.5 ${
                            isPinned
                              ? "sticky z-[1] bg-card"
                              : ""
                          }`}
                          style={{
                            left: isPinned
                              ? idx === 0
                                ? 0
                                : 120
                              : undefined,
                            minWidth: c.column.getSize(),
                            maxWidth: idx <= 1 ? c.column.getSize() : 200,
                          }}
                        >
                          {flexRender(
                            c.column.columnDef.cell,
                            c.getContext()
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
