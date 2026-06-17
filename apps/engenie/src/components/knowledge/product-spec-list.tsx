"use client";

import { Fragment, useMemo, useState } from "react";
import { TaxonomyBadges } from "./taxonomy-picker";
import { type SourceItem, formatDate, formatTokens } from "./shared";

interface Group {
  key: string;
  solution: string | null;
  line: string;
  items: SourceItem[];
  chunks: number;
  tokens: number;
}

/**
 * Product Specs list — grouped by Solution ▸ Product Line with collapsible
 * sections + a search box. Replaces the flat 80+-row table that became
 * unmanageable once there were multiple product lines / solutions.
 *
 * Grouping uses `product_line` (the always-present field on every source), so
 * it stays correct regardless of whether the newer unified-taxonomy badges
 * (solution/product_lines/models) have been backfilled on a given chunk.
 */
export function ProductSpecList({
  sources,
  onEditTax,
  onDelete,
}: {
  sources: SourceItem[];
  onEditTax: (s: SourceItem) => void;
  onDelete: (sourceType: string, sourceId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const groups = useMemo(() => {
    const filtered = q
      ? sources.filter(
          (s) =>
            s.source_id.toLowerCase().includes(q) ||
            (s.title ?? "").toLowerCase().includes(q),
        )
      : sources;
    const map = new Map<string, Group>();
    for (const s of filtered) {
      const line = s.product_line || "Untagged";
      const key = `${s.solution ?? ""}::${line}`;
      let g = map.get(key);
      if (!g) {
        g = { key, solution: s.solution ?? null, line, items: [], chunks: 0, tokens: 0 };
        map.set(key, g);
      }
      g.items.push(s);
      g.chunks += s.chunks;
      g.tokens += s.total_tokens;
    }
    // Sort by solution then product line; "Untagged"/no-solution sink to the end.
    return [...map.values()].sort(
      (a, b) =>
        (a.solution ?? "~").localeCompare(b.solution ?? "~") ||
        a.line.localeCompare(b.line),
    );
  }, [sources, q]);

  const matched = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);
  const isOpen = (key: string) => searching || expanded.has(key);
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋型號或標題…"
          className="w-full max-w-[240px] rounded-md border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/40"
        />
        <span className="text-xs tabular-nums text-muted-foreground/60">
          {searching ? `${matched} / ${sources.length}` : sources.length} models · {groups.length} lines
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setExpanded(new Set(groups.map((g) => g.key)))}
            className="text-xs text-muted-foreground/60 transition-colors hover:text-engenius-blue"
          >
            Expand all
          </button>
          <span className="text-muted-foreground/30">·</span>
          <button
            onClick={() => setExpanded(new Set())}
            className="text-xs text-muted-foreground/60 transition-colors hover:text-engenius-blue"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Source</th>
              <th className="px-3 py-2 text-left font-medium">Title</th>
              <th className="px-3 py-2 text-center font-medium">Chunks</th>
              <th className="px-3 py-2 text-center font-medium">Tokens</th>
              <th className="px-3 py-2 text-left font-medium">Last Updated</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground/60">
                  No models match “{search}”.
                </td>
              </tr>
            )}
            {groups.map((g) => {
              const open = isOpen(g.key);
              return (
                <Fragment key={g.key}>
                  <tr
                    className="cursor-pointer border-t bg-muted/30 transition-colors hover:bg-muted/50"
                    onClick={() => toggle(g.key)}
                  >
                    <td colSpan={6} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <svg
                          className={`h-3 w-3 flex-shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-90" : ""}`}
                          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                          <path d="M6 3l5 5-5 5" />
                        </svg>
                        {g.solution && (
                          <span className="rounded bg-engenius-blue/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-engenius-blue">
                            {g.solution}
                          </span>
                        )}
                        <span className="font-semibold text-engenius-dark">{g.line}</span>
                        <span className="tabular-nums text-muted-foreground/50">
                          {g.items.length} models · {g.chunks} chunks · {formatTokens(g.tokens)}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {open &&
                    g.items.map((s) => (
                      <tr
                        key={`${s.source_type}:${s.source_id}`}
                        className="border-t transition-colors hover:bg-muted/30"
                      >
                        <td
                          className="max-w-[260px] px-3 py-2 align-top font-mono font-medium text-engenius-blue"
                          title={s.source_id}
                        >
                          <div className="truncate">{s.source_id}</div>
                          <div className="mt-1">
                            <TaxonomyBadges
                              solution={s.solution ?? null}
                              product_lines={s.product_lines ?? []}
                              models={s.models ?? []}
                            />
                          </div>
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 align-top text-muted-foreground">
                          {s.title}
                        </td>
                        <td className="px-3 py-2 text-center align-top tabular-nums">{s.chunks}</td>
                        <td className="px-3 py-2 text-center align-top tabular-nums text-muted-foreground">
                          {formatTokens(s.total_tokens)}
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {formatDate(s.last_updated)}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => onEditTax(s)}
                              className="text-xs text-muted-foreground/60 transition-colors hover:text-engenius-blue"
                              title="Edit taxonomy tags"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => onDelete(s.source_type, s.source_id)}
                              className="text-xs text-muted-foreground/50 transition-colors hover:text-red-500"
                              title={`Delete ${s.source_id} from index`}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
