"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TaxonomyPicker, EMPTY_TAXONOMY_VALUE, type TaxonomyValue } from "../taxonomy-picker";
import { postIngest, taxonomyToPayload, taxValueFrom, type SourceItem } from "../shared";

/** Create a new text snippet, or edit an existing one (raw markdown is loaded
 *  from the source's chunk-0 metadata when `editSource` is provided). */
export function SnippetDialog({
  editSource,
  onClose,
  onSuccess,
}: {
  editSource?: SourceItem | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const editId = editSource?.source_id ?? null;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [label, setLabel] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>(EMPTY_TAXONOMY_VALUE);
  const [saving, setSaving] = useState(false);

  // When editing, fetch the raw markdown + tags once on open.
  useEffect(() => {
    if (!editSource) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/documents?source_type=text_snippet&source_id=${encodeURIComponent(editSource.source_id)}&raw=1`);
        const d = await res.json();
        if (cancelled) return;
        if (!d.ok) { toast.error("Couldn't load snippet"); onClose(); return; }
        setTitle(d.title || "");
        setContent(d.content || "");
        setLabel(d.label || "");
        setTaxonomy(taxValueFrom(d.taxonomy));
      } catch {
        if (!cancelled) { toast.error("Couldn't load snippet"); onClose(); }
      }
    })();
    return () => { cancelled = true; };
  }, [editSource, onClose]);

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      toast.error("Enter a title and content");
      return;
    }
    setSaving(true);
    try {
      const data = await postIngest({
        source_type: "text_snippet",
        source_id: editId || undefined,
        title: title.trim(),
        content,
        label: label.trim() || undefined,
        taxonomy: taxonomyToPayload(taxonomy),
      });
      if (data.ok) {
        toast.success(editId ? "Snippet updated" : `Snippet saved (${data.chunks} chunk${(data.chunks ?? 0) > 1 ? "s" : ""})`);
        onSuccess();
        onClose();
      } else {
        toast.error(`Failed: ${data.error}`);
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
          <h2 className="text-lg font-semibold">{editId ? "Edit Snippet" : "New Text Snippet"}</h2>
          <button onClick={() => !saving && onClose()} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={saving}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Title <span className="text-red-500">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., ECW536 vs ECC500 — quick comparison"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" disabled={saving} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Content (Markdown) <span className="text-red-500">*</span></label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)}
              placeholder={"Write the answer / FAQ / comparison here.\nMarkdown supported: ## headings, - bullets, **bold**, tables."}
              rows={10}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" disabled={saving} />
            <p className="mt-1 text-[11px] text-muted-foreground/50">Long content is auto-split into chunks; Markdown headings (##) make good boundaries.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Label (optional)</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Sales FAQ"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" disabled={saving} />
          </div>
          <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
            <p className="text-xs font-medium mb-2">Taxonomy <span className="font-normal text-muted-foreground/60">(optional, defaults to Global)</span></p>
            <TaxonomyPicker value={taxonomy} onChange={setTaxonomy} allowGlobal required={false} disabled={saving} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose()} disabled={saving} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim() || !content.trim() || saving} className="text-xs">
            {saving ? "Saving..." : editId ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
