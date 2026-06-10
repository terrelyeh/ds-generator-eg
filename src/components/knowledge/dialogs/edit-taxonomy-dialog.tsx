"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TaxonomyPicker, type TaxonomyValue } from "../taxonomy-picker";
import { taxonomyToPayload, type SourceItem } from "../shared";

/** Edit taxonomy tags for a single source OR a whole Gitbook space (applies the
 *  same tags to every source in the space) via PATCH /api/documents. */
export function EditTaxonomyDialog({
  target,
  space,
  onClose,
  onSuccess,
}: {
  target?: SourceItem | null;
  space?: { label: string; sources: SourceItem[] } | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const init = space ? space.sources[0] : target;
  const [value, setValue] = useState<TaxonomyValue>(() => ({
    solution: init?.solution ?? null,
    product_lines: init?.product_lines ?? [],
    models: init?.models ?? [],
  }));
  const [saving, setSaving] = useState(false);

  const subtitle = space
    ? `${space.label} · ${space.sources.length} 個來源`
    : (target?.tab_name || target?.source_id);

  async function handleSave() {
    const targets = space
      ? space.sources.map((s) => ({ source_type: s.source_type, source_id: s.source_id }))
      : target
        ? [{ source_type: target.source_type, source_id: target.source_id }]
        : [];
    if (targets.length === 0) return;
    setSaving(true);
    try {
      const payload = taxonomyToPayload(value);
      const results = await Promise.all(
        targets.map((t) =>
          fetch("/api/documents", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source_type: t.source_type, source_id: t.source_id, taxonomy: payload }),
          }).then((r) => r.json()).catch(() => ({ ok: false })),
        ),
      );
      const okCount = results.filter((r) => r.ok).length;
      if (okCount > 0) {
        toast.success(`Updated taxonomy on ${okCount} source${okCount === 1 ? "" : "s"}`);
        onSuccess();
        onClose();
      } else {
        toast.error("Failed to update taxonomy");
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !saving && onClose()}>
      <div className="bg-background rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Edit Taxonomy</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <button onClick={() => !saving && onClose()} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={saving}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <TaxonomyPicker value={value} onChange={setValue} allowGlobal required disabled={saving} />

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose()} disabled={saving} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
