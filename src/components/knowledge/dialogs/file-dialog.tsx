"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TaxonomyPicker, EMPTY_TAXONOMY_VALUE, type TaxonomyValue } from "../taxonomy-picker";
import { taxonomyToPayload } from "../shared";

/** Upload a PDF — read by AI (tables, figures, scanned OCR) and indexed. Uses
 *  the dedicated multipart endpoint, not the JSON ingest path. */
export function FileDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>(EMPTY_TAXONOMY_VALUE);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) { toast.error("Choose a file"); return; }
    if (file.size > 4 * 1024 * 1024) { toast.error("File too large (max 4 MB)"); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (label.trim()) form.append("label", label.trim());
      form.append("taxonomy", JSON.stringify(taxonomyToPayload(taxonomy)));
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Indexed ${data.chunks} chunk${data.chunks > 1 ? "s" : ""}${data.stored ? "" : " (original not stored)"}`);
        if (data.truncated) {
          toast.warning("這份 PDF 較長，AI 抽取可能在中途截斷（後段未完整索引）。建議拆分後再上傳。", { duration: 8000 });
        }
        onSuccess();
        onClose();
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !uploading && onClose()}>
      <div className="bg-background rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Upload PDF</h2>
          <button onClick={() => !uploading && onClose()} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={uploading}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">File <span className="text-red-500">*</span></label>
            <input type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
              className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-engenius-blue/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-engenius-blue hover:file:bg-engenius-blue/20" />
            <p className="mt-1 text-[11px] text-muted-foreground/50">PDF only, max 4 MB. Read by AI: tables → Markdown, figures described, scanned pages OCR&apos;d.</p>
            {file && <p className="mt-1 text-[11px] text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Label (optional)</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., ECW536 Datasheet"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" disabled={uploading} />
          </div>
          <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
            <p className="text-xs font-medium mb-2">Taxonomy <span className="font-normal text-muted-foreground/60">(optional, defaults to Global)</span></p>
            <TaxonomyPicker value={taxonomy} onChange={setTaxonomy} allowGlobal required={false} disabled={uploading} />
          </div>
        </div>
        {uploading && (
          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-4 w-4 rounded-full border-2 border-engenius-blue/30 border-t-engenius-blue animate-spin" />
              <span>Extracting text and generating embeddings...</span>
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose()} disabled={uploading} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleUpload} disabled={!file || uploading} className="text-xs">
            {uploading ? "Uploading..." : "Upload & Index"}
          </Button>
        </div>
      </div>
    </div>
  );
}
