"use client";

import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type {
  BattlecardGroup,
  BattlecardColumn,
} from "@/app/(main)/battlecard/[line]/page";

const TIER_STYLES: Record<number, string> = {
  1: "bg-red-100 text-red-700 border-red-200",
  2: "bg-amber-100 text-amber-700 border-amber-200",
  3: "bg-slate-100 text-slate-600 border-slate-200",
};

interface CellState {
  valueId: string | null;
  value: string;
  confirmed: boolean;
  sourceUrl: string | null;
  capturedAt: string | null;
}

const cellKey = (dimensionId: string, colKey: string) => `${dimensionId}|${colKey}`;

function TierBadge({ tier }: { tier?: number }) {
  if (!tier) return null;
  return (
    <span
      className={`ml-1 rounded border px-1 py-0 text-[9px] font-bold uppercase tracking-wide ${TIER_STYLES[tier] ?? TIER_STYLES[3]}`}
      title={`Tier ${tier} competitor for this model`}
    >
      T{tier}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

// ---------------------------------------------------------------------------
// Cell — read mode + inline edit (when canEdit)
// ---------------------------------------------------------------------------

function Cell({
  state,
  column,
  dimensionId,
  canEdit,
  onSave,
}: {
  state: CellState;
  column: BattlecardColumn;
  dimensionId: string;
  canEdit: boolean;
  onSave: (
    args: { dimensionId: string; column: BattlecardColumn; value: string; sourceUrl: string | null; confirm: boolean }
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.value);
  const [draftSource, setDraftSource] = useState(state.sourceUrl ?? "");
  const [saving, setSaving] = useState(false);

  const isDraft = column.owner === "competitor" && !!state.value && !state.confirmed;

  const begin = () => {
    if (!canEdit) return;
    setDraft(state.value);
    setDraftSource(state.sourceUrl ?? "");
    setEditing(true);
  };

  const submit = async (confirm: boolean) => {
    setSaving(true);
    const ok = await onSave({
      dimensionId,
      column,
      value: draft,
      sourceUrl: draftSource.trim() || null,
      confirm,
    });
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <div className="min-w-[170px] space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          className="w-full resize-y rounded border border-border bg-background px-1.5 py-1 text-xs focus:border-engenius-blue focus:outline-none"
        />
        <Input
          value={draftSource}
          onChange={(e) => setDraftSource(e.target.value)}
          placeholder="source URL (optional)"
          className="h-6 text-[10px]"
        />
        <div className="flex items-center gap-1">
          <Button size="sm" className="h-6 px-2 text-[10px]" disabled={saving} onClick={() => submit(false)}>
            Save
          </Button>
          <Button
            size="sm"
            className="h-6 bg-emerald-600 px-2 text-[10px] hover:bg-emerald-700"
            disabled={saving}
            onClick={() => submit(true)}
          >
            Save &amp; Confirm
          </Button>
          <button
            className="px-1 text-[10px] text-muted-foreground hover:text-foreground"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const hover = state.sourceUrl
    ? `Source: ${state.sourceUrl}${state.capturedAt ? `\nCaptured: ${fmtDate(state.capturedAt)}` : ""}`
    : undefined;

  return (
    <div
      className={`group/cell flex items-start gap-1 ${canEdit ? "cursor-text" : ""}`}
      onClick={begin}
      title={hover}
    >
      {isDraft && (
        <span
          className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500"
          title="Draft — awaiting PM confirmation"
        />
      )}
      {state.value ? (
        <span className={`whitespace-pre-line break-words ${isDraft ? "text-amber-900" : ""}`}>
          {state.value}
        </span>
      ) : (
        <span className="text-muted-foreground/25">
          {canEdit ? "+ add" : "—"}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group table
// ---------------------------------------------------------------------------

function GroupTable({
  group,
  query,
  cells,
  canEdit,
  onSave,
  onResync,
  onConfirmAll,
}: {
  group: BattlecardGroup;
  query: string;
  cells: Map<string, CellState>;
  canEdit: boolean;
  onSave: (
    args: { dimensionId: string; column: BattlecardColumn; value: string; sourceUrl: string | null; confirm: boolean }
  ) => Promise<boolean>;
  onResync: (competitorProductId: string) => void | Promise<void>;
  onConfirmAll: () => void;
}) {
  const filteredRows = useMemo(() => {
    if (!query) return group.rows;
    const q = query.toLowerCase();
    return group.rows.filter((r) => {
      if (r.label.toLowerCase().includes(q)) return true;
      return group.columns.some((c) => (cells.get(cellKey(r.dimensionId, c.key))?.value ?? "").toLowerCase().includes(q));
    });
  }, [group.rows, group.columns, query, cells]);

  const byCategory = useMemo(() => {
    const map = new Map<string, typeof filteredRows>();
    for (const r of filteredRows) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return [...map.entries()];
  }, [filteredRows]);

  // Live confirmation progress over competitor cells that have a value.
  const { confirmed, total } = useMemo(() => {
    let c = 0;
    let t = 0;
    for (const row of group.rows) {
      for (const col of group.columns) {
        if (col.owner !== "competitor") continue;
        const st = cells.get(cellKey(row.dimensionId, col.key));
        if (st?.value) {
          t++;
          if (st.confirmed) c++;
        }
      }
    }
    return { confirmed: c, total: t };
  }, [group.rows, group.columns, cells]);

  const colCount = group.columns.length + 1;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          <span className="text-engenius-blue">{group.anchorModel}</span>
          {group.anchorName && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{group.anchorName}</span>
          )}
        </h2>
        <span className="text-xs text-muted-foreground">
          vs {group.columns.length - 1} competitor{group.columns.length - 1 === 1 ? "" : "s"}
        </span>
        {total > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            · {confirmed}/{total} competitor cells confirmed
          </span>
        )}
        {canEdit && total > confirmed && (
          <button
            onClick={onConfirmAll}
            className="rounded border border-emerald-600/40 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Confirm all drafts ({total - confirmed})
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <table className="min-w-max text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b-2 border-foreground/12 bg-muted">
                <th
                  className="sticky left-0 z-20 bg-muted px-3 py-2.5 text-left font-semibold"
                  style={{ minWidth: 190, boxShadow: "2px 0 4px -2px rgba(0,0,0,0.08)" }}
                >
                  Spec
                </th>
                {group.columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-2.5 text-left font-semibold ${col.owner === "engenius" ? "bg-engenius-blue/10" : "bg-muted"}`}
                    style={{ minWidth: 150, maxWidth: 240 }}
                  >
                    {col.owner === "engenius" ? (
                      <span className="text-engenius-blue">
                        {col.label}
                        <span className="ml-1 rounded bg-engenius-blue/15 px-1 py-0 text-[9px] font-bold uppercase tracking-wide text-engenius-blue">
                          Ours
                        </span>
                      </span>
                    ) : (
                      <span className="text-foreground">
                        {col.brand && <span className="block text-[11px] font-normal text-muted-foreground">{col.brand}</span>}
                        {col.label}
                        <TierBadge tier={col.tier} />
                        {canEdit && (
                          <button
                            onClick={() => onResync(col.key)}
                            title="Re-scrape this competitor's datasheet and refresh draft values (keeps confirmed cells)"
                            className="ml-1.5 align-middle text-[10px] font-normal text-engenius-blue hover:underline"
                          >
                            ↻ sync
                          </button>
                        )}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byCategory.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No matching specs.
                  </td>
                </tr>
              ) : (
                byCategory.map(([category, rows]) => (
                  <CategoryBlock
                    key={category}
                    category={category}
                    rows={rows}
                    columns={group.columns}
                    colCount={colCount}
                    cells={cells}
                    canEdit={canEdit}
                    onSave={onSave}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CategoryBlock({
  category,
  rows,
  columns,
  colCount,
  cells,
  canEdit,
  onSave,
}: {
  category: string;
  rows: BattlecardGroup["rows"];
  columns: BattlecardColumn[];
  colCount: number;
  cells: Map<string, CellState>;
  canEdit: boolean;
  onSave: (
    args: { dimensionId: string; column: BattlecardColumn; value: string; sourceUrl: string | null; confirm: boolean }
  ) => Promise<boolean>;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={colCount}
          className="sticky left-0 bg-muted/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-engenius-blue"
        >
          {category}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.dimensionId} className="border-b border-border/40 hover:bg-engenius-blue/[0.06] transition-colors">
          <td
            className="sticky left-0 z-[1] bg-card px-3 py-1.5 font-medium text-muted-foreground"
            style={{ minWidth: 190, boxShadow: "2px 0 4px -2px rgba(0,0,0,0.08)" }}
          >
            {row.label}
            {row.unit && <span className="ml-1 text-[10px] text-muted-foreground/60">({row.unit})</span>}
          </td>
          {columns.map((col) => (
            <td
              key={col.key}
              className={`px-3 py-1.5 align-top ${col.owner === "engenius" ? "bg-engenius-blue/[0.04]" : ""}`}
              style={{ minWidth: 150, maxWidth: 240 }}
            >
              <Cell
                state={cells.get(cellKey(row.dimensionId, col.key)) ?? { valueId: null, value: "", confirmed: false, sourceUrl: null, capturedAt: null }}
                column={col}
                dimensionId={row.dimensionId}
                canEdit={canEdit}
                onSave={onSave}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Manage panel — add / re-tier / remove competitor matchups (canEdit only)
// ---------------------------------------------------------------------------

function ManagePanel({
  lineId,
  activeGroup,
  lineProducts,
  knownBrands,
  mutate,
}: {
  lineId: string;
  activeGroup: BattlecardGroup;
  lineProducts: { model_name: string; full_name: string }[];
  knownBrands: string[];
  mutate: (method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [anchor, setAnchor] = useState(activeGroup.anchorModel);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [tier, setTier] = useState(1);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const competitors = activeGroup.columns.filter((c) => c.owner === "competitor");
  const selectCls = "h-7 rounded border border-border bg-background px-1.5 text-xs";

  const reloadIf = (ok: boolean) => {
    if (ok) {
      toast.success("Updated");
      window.location.reload();
    }
  };

  const add = async () => {
    if (!brand.trim() || !model.trim()) {
      toast.error("Brand and model are required");
      return;
    }
    setBusy(true);
    const ok = await mutate("POST", {
      lineId,
      anchorModelName: anchor,
      brandName: brand,
      competitorModelName: model,
      tier,
      datasheetUrl: url || undefined,
    });
    setBusy(false);
    reloadIf(ok);
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Competitors for {activeGroup.anchorModel}</h3>
        <p className="text-[11px] text-muted-foreground">
          Add, re-tier, or remove competitor matchups. Spec values are filled in the table (or via re-sync).
        </p>
      </div>

      <div className="space-y-1.5">
        {competitors.length === 0 ? (
          <p className="text-xs text-muted-foreground">No competitors yet for this model.</p>
        ) : (
          competitors.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-xs">
              <span className="min-w-[170px] font-medium">
                {c.brand ? `${c.brand} ` : ""}
                {c.label}
              </span>
              <select
                className={selectCls}
                value={c.tier ?? 1}
                onChange={(e) =>
                  mutate("PATCH", {
                    anchorModelName: activeGroup.anchorModel,
                    competitorProductId: c.key,
                    tier: Number(e.target.value),
                  }).then(reloadIf)
                }
              >
                <option value={1}>T1</option>
                <option value={2}>T2</option>
                <option value={3}>T3</option>
              </select>
              <button
                className="text-red-600 hover:underline"
                onClick={() =>
                  mutate("DELETE", { anchorModelName: activeGroup.anchorModel, competitorProductId: c.key }).then(reloadIf)
                }
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t pt-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Add competitor</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            EnGenius model
            <select className={selectCls} value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              {lineProducts.map((p) => (
                <option key={p.model_name} value={p.model_name}>
                  {p.model_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            Brand (new or existing)
            <Input
              list="bc-brands"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Type a new brand or pick…"
              className="h-7 w-44 text-xs"
            />
            <datalist id="bc-brands">
              {knownBrands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            Model
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="U7 Pro" className="h-7 w-28 text-xs" />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            Tier
            <select className={selectCls} value={tier} onChange={(e) => setTier(Number(e.target.value))}>
              <option value={1}>T1</option>
              <option value={2}>T2</option>
              <option value={3}>T3</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-muted-foreground" style={{ minWidth: "20rem" }}>
            Datasheet URL (optional)
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (used by ↻ sync)" className="h-7 w-full text-xs" />
          </label>
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={add}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function BattlecardView({
  groups,
  canEdit,
  lineId,
  lineProducts,
}: {
  groups: BattlecardGroup[];
  canEdit: boolean;
  lineId: string;
  lineProducts: { model_name: string; full_name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [activeAnchor, setActiveAnchor] = useState(groups[0]?.anchorModel ?? "");
  const [managing, setManaging] = useState(false);

  // Existing brands across the board → datalist suggestions in the add form.
  const knownBrands = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) for (const c of g.columns) if (c.brand) s.add(c.brand);
    return [...s].sort();
  }, [groups]);

  const activeGroup = groups.find((g) => g.anchorModel === activeAnchor) ?? groups[0];

  // Matchup mutations → reload so the server re-aggregates groups/columns.
  const mutateMatchup = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await fetch("/api/battlecard/matchup", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "Failed", { description: json.details });
          return false;
        }
        return true;
      } catch (e) {
        toast.error("Failed", { description: e instanceof Error ? e.message : String(e) });
        return false;
      }
    },
    []
  );

  // Flat live cell store, seeded from server data.
  const [cells, setCells] = useState<Map<string, CellState>>(() => {
    const m = new Map<string, CellState>();
    for (const g of groups) {
      for (const row of g.rows) {
        for (const col of g.columns) {
          const c = row.cells[col.key];
          if (c) m.set(cellKey(row.dimensionId, col.key), { ...c });
        }
      }
    }
    return m;
  });

  const onSave = useCallback(
    async ({
      dimensionId,
      column,
      value,
      sourceUrl,
      confirm,
    }: {
      dimensionId: string;
      column: BattlecardColumn;
      value: string;
      sourceUrl: string | null;
      confirm: boolean;
    }): Promise<boolean> => {
      const key = cellKey(dimensionId, column.key);
      const existing = cells.get(key);
      try {
        const res = await fetch("/api/battlecard/value", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valueId: existing?.valueId ?? null,
            dimensionId,
            ownerType: column.owner,
            ownerKey: column.key,
            value,
            sourceUrl,
            confirm,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "Save failed", { description: json.details });
          return false;
        }
        setCells((prev) => {
          const next = new Map(prev);
          next.set(key, {
            valueId: json.id ?? existing?.valueId ?? null,
            value,
            confirmed: confirm ? true : existing?.confirmed ?? false,
            sourceUrl,
            capturedAt: existing?.capturedAt ?? null,
          });
          return next;
        });
        toast.success(confirm ? "Confirmed" : "Saved");
        return true;
      } catch (e) {
        toast.error("Save failed", { description: e instanceof Error ? e.message : String(e) });
        return false;
      }
    },
    [cells]
  );

  // Re-scrape one competitor's datasheet → fresh drafts (server side).
  const resync = useCallback(async (competitorProductId: string) => {
    const t = toast.loading("Re-syncing competitor…");
    try {
      const res = await fetch("/api/battlecard/resync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorProductId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Re-sync failed", { id: t, description: json.details });
        return;
      }
      toast.success(
        `Re-synced: ${json.updated} updated · ${json.skipped} kept (confirmed) · ${json.notFound} not found`,
        { id: t }
      );
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast.error("Re-sync failed", { id: t, description: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  // Bulk "Save & Confirm" — mark every filled, unconfirmed competitor cell in
  // one anchor's table as confirmed.
  const confirmAllForGroup = useCallback(
    async (group: BattlecardGroup) => {
      const ids = group.columns.filter((c) => c.owner === "competitor").map((c) => c.key);
      const keysToFlip: string[] = [];
      for (const row of group.rows) {
        for (const id of ids) {
          const k = cellKey(row.dimensionId, id);
          const st = cells.get(k);
          if (st?.value && !st.confirmed) keysToFlip.push(k);
        }
      }
      if (keysToFlip.length === 0) {
        toast("Nothing to confirm — all filled cells are already confirmed.");
        return;
      }
      const t = toast.loading(`Confirming ${keysToFlip.length} cells…`);
      try {
        const res = await fetch("/api/battlecard/confirm-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitorProductIds: ids }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "Confirm failed", { id: t, description: json.details });
          return;
        }
        setCells((prev) => {
          const next = new Map(prev);
          for (const k of keysToFlip) {
            const st = next.get(k);
            if (st) next.set(k, { ...st, confirmed: true });
          }
          return next;
        });
        toast.success(`Confirmed ${json.confirmed} cells`, { id: t });
      } catch (e) {
        toast.error("Confirm failed", { id: t, description: e instanceof Error ? e.message : String(e) });
      }
    },
    [cells]
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input
            placeholder="Search specs, values..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Draft (unconfirmed)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-muted-foreground/25">—</span> No data
          </span>
          {canEdit && <span>· click a cell to edit</span>}
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setManaging((m) => !m)}
          >
            {managing ? "Close" : "Manage competitors"}
          </Button>
        )}
      </div>

      {managing && activeGroup && (
        <ManagePanel
          lineId={lineId}
          activeGroup={activeGroup}
          lineProducts={lineProducts}
          knownBrands={knownBrands}
          mutate={mutateMatchup}
        />
      )}

      {/* Anchor tabs — one EnGenius model's battlecard at a time, instead of
          stacking every anchor vertically (scales as more anchors are added). */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b">
          {groups.map((group) => {
            const isActive = group.anchorModel === activeAnchor;
            return (
              <button
                key={group.anchorModel}
                onClick={() => setActiveAnchor(group.anchorModel)}
                className={`-mb-px rounded-t-md border-b-2 px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? "border-engenius-blue text-engenius-blue"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {group.anchorModel}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  vs {group.columns.length - 1}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {groups
        .filter((group) => groups.length === 1 || group.anchorModel === activeAnchor)
        .map((group) => (
          <GroupTable
            key={group.anchorModel}
            group={group}
            query={query}
            cells={cells}
            canEdit={canEdit}
            onSave={onSave}
            onResync={resync}
            onConfirmAll={() => confirmAllForGroup(group)}
          />
        ))}
    </div>
  );
}
