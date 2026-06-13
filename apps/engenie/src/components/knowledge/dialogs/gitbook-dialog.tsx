"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TaxonomyPicker, EMPTY_TAXONOMY_VALUE, type TaxonomyValue } from "../taxonomy-picker";
import { postIngest, taxonomyToPayload } from "../shared";

/** Known Gitbook spaces — easily add more here */
const GITBOOK_SPACES: { url: string; label: string }[] = [
  { url: "https://doc.engenius.ai/cloud-licensing", label: "Cloud Licensing" },
  { url: "https://doc.engenius.ai/home-cloud-user-manual", label: "Cloud User Manual" },
];

export function GitbookDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [vision, setVision] = useState(true);
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>(EMPTY_TAXONOMY_VALUE);
  const [ingesting, setIngesting] = useState(false);

  async function handleIngest() {
    setIngesting(true);
    try {
      const data = await postIngest({
        source_type: "gitbook",
        space_url: url,
        space_label: label,
        enable_vision: vision,
        force: false,
        taxonomy: taxonomyToPayload(taxonomy),
      });
      if (data.ok) {
        const parts = [
          `${data.processed} chunks indexed`,
          `${data.skipped} unchanged`,
          `${data.pages_fetched} pages fetched`,
          data.pages_skipped && data.pages_skipped > 0 ? `${data.pages_skipped} empty pages skipped` : null,
          data.images_described && data.images_described > 0 ? `${data.images_described} images described` : null,
        ].filter(Boolean);
        const errMsg = data.errors?.length ? ` (${data.errors.length} errors)` : "";
        toast.success(`${label}: ${parts.join(", ")}${errMsg}`);
        if (data.errors?.length) console.warn("Gitbook ingestion errors:", data.errors);
        onSuccess();
        onClose();
      } else {
        toast.error(`Ingestion failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Ingestion failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !ingesting && onClose()}>
      <div className="bg-background rounded-xl shadow-xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Index Gitbook Space</h2>
          <button onClick={() => !ingesting && onClose()} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={ingesting}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        {/* Quick select from known spaces */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-2">Quick Select</label>
          <div className="flex flex-wrap gap-2">
            {GITBOOK_SPACES.map((space) => (
              <button
                key={space.url}
                onClick={() => { setUrl(space.url); setLabel(space.label); }}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  url === space.url
                    ? "border-engenius-blue bg-engenius-blue/10 text-engenius-blue"
                    : "hover:border-engenius-blue/50 hover:bg-muted"
                }`}
              >
                {space.label}
              </button>
            ))}
          </div>
        </div>

        {/* Manual URL input */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Space URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://doc.engenius.ai/cloud-licensing"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
              disabled={ingesting}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Cloud Licensing"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
              disabled={ingesting}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="gitbook-vision"
              checked={vision}
              onChange={(e) => setVision(e.target.checked)}
              className="rounded border"
              disabled={ingesting}
            />
            <label htmlFor="gitbook-vision" className="text-xs text-muted-foreground">
              Describe images with AI Vision (uses Gemini API credits)
            </label>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
          <p className="text-xs font-medium mb-2">這個 space 屬於哪個領域？ <span className="font-normal text-muted-foreground/60">(可選 — 產品線或知識領域，預設 Global)</span></p>
          <TaxonomyPicker value={taxonomy} onChange={setTaxonomy} allowGlobal required={false} disabled={ingesting} />
        </div>

        {ingesting && (
          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <svg className="h-4 w-4 animate-spin text-engenius-blue" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Fetching pages, describing images, and generating embeddings...</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">This may take a few minutes for large spaces.</p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose()} disabled={ingesting} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleIngest} disabled={!url || !label || ingesting} className="text-xs">
            {ingesting ? "Indexing..." : "Start Indexing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
