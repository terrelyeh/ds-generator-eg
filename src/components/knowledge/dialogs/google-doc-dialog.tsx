"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TaxonomyPicker, EMPTY_TAXONOMY_VALUE, type TaxonomyValue } from "../taxonomy-picker";
import { postIngest, taxonomyToPayload } from "../shared";

export function GoogleDocDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>(EMPTY_TAXONOMY_VALUE);
  const [ingesting, setIngesting] = useState(false);

  async function handleIngest() {
    if (!url.trim()) return;
    if (!taxonomy.solution) {
      toast.error("Please select a Solution");
      return;
    }
    setIngesting(true);
    try {
      const data = await postIngest({
        source_type: "google_doc",
        doc_url: url.trim(),
        label: label.trim() || undefined,
        force: false,
        taxonomy: taxonomyToPayload(taxonomy),
      });
      if (data.ok) {
        toast.success(`Google Doc: ${data.processed} chunks indexed, ${data.tabs_found} tabs found`);
        onSuccess();
        onClose();
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !ingesting && onClose()}>
      <div className="bg-background rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Index Google Doc</h2>
          <button onClick={() => !ingesting && onClose()} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={ingesting}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Google Doc URL <span className="text-red-500">*</span></label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
              disabled={ingesting} />
            <p className="mt-1 text-[11px] text-muted-foreground/50">Doc must be shared with &quot;Anyone with the link&quot; or with the service account</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Label (optional)</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., AI Surveillance Message Guide"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
              disabled={ingesting} />
          </div>

          <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
            <p className="text-xs font-medium mb-2">Taxonomy — where does this doc belong?</p>
            <TaxonomyPicker value={taxonomy} onChange={setTaxonomy} allowGlobal required disabled={ingesting} />
          </div>
        </div>

        {ingesting && (
          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-4 w-4 rounded-full border-2 border-engenius-blue/30 border-t-engenius-blue animate-spin" />
              <span>Fetching document and generating embeddings...</span>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose()} disabled={ingesting} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleIngest} disabled={!url.trim() || !taxonomy.solution || ingesting} className="text-xs">
            {ingesting ? "Indexing..." : "Start Indexing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
