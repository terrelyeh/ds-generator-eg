"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TaxonomyPicker, EMPTY_TAXONOMY_VALUE, type TaxonomyValue } from "../taxonomy-picker";
import { postIngest, taxonomyToPayload } from "../shared";

export function WebDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [urls, setUrls] = useState("");
  const [label, setLabel] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>(EMPTY_TAXONOMY_VALUE);
  const [ingesting, setIngesting] = useState(false);

  async function handleIngest() {
    const pageUrls = urls.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
    if (pageUrls.length === 0) {
      toast.error("Paste at least one URL");
      return;
    }
    setIngesting(true);
    try {
      const data = await postIngest({
        source_type: "web",
        page_urls: pageUrls,
        label: label.trim() || undefined,
        force: false,
        taxonomy: taxonomyToPayload(taxonomy),
      });
      if (data.ok) {
        const methodStr = data.methods
          ? Object.entries(data.methods).map(([m, n]) => `${n} ${m}`).join(", ")
          : "";
        const errMsg = data.errors?.length ? ` · ${data.errors.length} errors` : "";
        toast.success(
          `Web: ${data.processed} chunks from ${data.pages_fetched} page(s)` +
            (methodStr ? ` (${methodStr})` : "") + errMsg,
        );
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
          <h2 className="text-lg font-semibold">Index Web Page(s)</h2>
          <button onClick={() => !ingesting && onClose()} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={ingesting}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Page URL(s) <span className="text-red-500">*</span></label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={"https://www.engenius.com/product/...\nhttps://www.engenius.com/blog/...\n(one URL per line)"}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
              disabled={ingesting}
            />
            <p className="mt-1 text-[11px] text-muted-foreground/50">One URL per line (or comma-separated). Content is auto-extracted: Firecrawl → Jina → fetch.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Label (optional)</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., EnGenius Website"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
              disabled={ingesting} />
          </div>

          <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
            <p className="text-xs font-medium mb-2">Taxonomy — where do these pages belong? <span className="font-normal text-muted-foreground/60">(optional, defaults to Global)</span></p>
            <TaxonomyPicker value={taxonomy} onChange={setTaxonomy} allowGlobal required={false} disabled={ingesting} />
          </div>
        </div>

        {ingesting && (
          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-4 w-4 rounded-full border-2 border-engenius-blue/30 border-t-engenius-blue animate-spin" />
              <span>Extracting page content and generating embeddings...</span>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose()} disabled={ingesting} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleIngest} disabled={!urls.trim() || ingesting} className="text-xs">
            {ingesting ? "Indexing..." : "Start Indexing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
