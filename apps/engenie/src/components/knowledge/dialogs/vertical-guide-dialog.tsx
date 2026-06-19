"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Vertical Guide ingest dialog. Supply the content master `.md` either by
 * uploading the file or pasting a GitHub repo link; preview which rag:✓ sections
 * + metadata will be indexed (dry-run), then Index. This is the org-level gate:
 * the skill authors/renders, the admin decides what enters the shared RAG.
 */

interface Preview {
  sourceId: string;
  title: string;
  included: string[];
  skipped: { section: string; rag: string }[];
  metadata: Record<string, unknown>;
  chunkPreviews: { index: number; title: string; chars: number }[];
  chunks: number;
}

/** filename / url path → a stable source_id (strip `guide-`, ext, map locale). */
function deriveSourceId(name: string): string {
  return name
    .replace(/\.(md|markdown)$/i, "")
    .replace(/^guide-/, "")
    .replace(/\.zh-TW$/i, "-zh")
    .replace(/\.([a-z]{2}(?:-[a-z]{2})?)$/i, (_, l) => "-" + l.toLowerCase().split("-")[0]);
}

export function VerticalGuideDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [markdown, setMarkdown] = useState("");
  const [url, setUrl] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [solution, setSolution] = useState("cloud");
  const [productLines, setProductLines] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  function onFile(f: File | null) {
    if (!f) return;
    setSourceId(deriveSourceId(f.name));
    const reader = new FileReader();
    reader.onload = () => setMarkdown(String(reader.result ?? ""));
    reader.readAsText(f);
    setPreview(null);
  }

  function payload(dryRun: boolean) {
    return {
      mode,
      markdown: mode === "upload" ? markdown : undefined,
      url: mode === "url" ? url.trim() : undefined,
      source_id: sourceId.trim(),
      source_url: sourceUrl.trim() || null,
      solution: solution.trim() || "cloud",
      product_lines: productLines.split(",").map((s) => s.trim()).filter(Boolean),
      dry_run: dryRun,
    };
  }

  async function run(dryRun: boolean) {
    if (mode === "upload" && !markdown.trim()) { toast.error("Upload a .md file"); return; }
    if (mode === "url" && !url.trim()) { toast.error("Paste a repo link"); return; }
    if (!sourceId.trim()) { toast.error("source_id required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/documents/vertical-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(dryRun)),
      });
      const data = await res.json();
      if (!data.ok) { toast.error(`Failed: ${data.error}`); return; }
      if (dryRun) {
        setPreview(data as Preview);
        if (mode === "url" && data.sourceId && !sourceId) setSourceId(data.sourceId);
      } else {
        toast.success(`Indexed "${data.sourceId}" — ${data.processed} chunks`);
        onSuccess();
        onClose();
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const meta = preview?.metadata as Record<string, unknown> | undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !busy && onClose()}>
      <div className="bg-background rounded-xl shadow-xl max-w-xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Index Vertical Guide</h2>
          <button onClick={() => !busy && onClose()} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={busy}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="space-y-3">
          {/* Source mode toggle */}
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            {(["upload", "url"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setPreview(null); }} disabled={busy}
                className={`rounded px-3 py-1 font-medium transition-colors ${mode === m ? "bg-engenius-blue text-white" : "text-muted-foreground hover:text-foreground"}`}>
                {m === "upload" ? "Upload .md" : "Repo link"}
              </button>
            ))}
          </div>

          {mode === "upload" ? (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Content master .md <span className="text-red-500">*</span></label>
              <input type="file" accept=".md,.markdown,text/markdown" disabled={busy}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-engenius-blue/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-engenius-blue hover:file:bg-engenius-blue/20" />
              {markdown && <p className="mt-1 text-[11px] text-muted-foreground">{(markdown.length / 1024).toFixed(1)} KB loaded</p>}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">GitHub link to the master .md <span className="text-red-500">*</span></label>
              <input type="url" value={url} disabled={busy}
                onChange={(e) => { setUrl(e.target.value); if (e.target.value) setSourceId((s) => s || deriveSourceId(e.target.value.split("/").pop() || "")); }}
                placeholder="https://github.com/<owner>/eg-vertical-guides/blob/main/guides/guide-retail-surveillance.md"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
              <p className="mt-1 text-[11px] text-muted-foreground/50">Private repo → needs <code>GITHUB_TOKEN</code> in the engenie env. Re-index re-fetches the latest.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">source_id <span className="text-red-500">*</span></label>
              <input type="text" value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={busy}
                placeholder="retail-surveillance"
                className="w-full rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Solution slug (product-kind)</label>
              <input type="text" value={solution} onChange={(e) => setSolution(e.target.value)} disabled={busy}
                placeholder="cloud"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Deployed guide URL (citation)</label>
              <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} disabled={busy}
                placeholder="https://eg-vertical-guides.vercel.app/retail-surveillance"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Product lines (comma)</label>
              <input type="text" value={productLines} onChange={(e) => setProductLines(e.target.value)} disabled={busy}
                placeholder="Cloud Camera, Cloud AI-NVS"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
            </div>
          </div>

          {/* Dry-run preview */}
          {preview && (
            <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-2">
              <div className="font-medium text-foreground">{preview.title} · {preview.chunks} chunks</div>
              <div>
                <span className="text-emerald-700 font-medium">Indexed (rag:✓): </span>
                {preview.included.length}: {preview.included.map((s) => s.replace(/^\d+\.\s*/, "")).join(" · ")}
              </div>
              {preview.skipped.length > 0 && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Skipped: </span>
                  {preview.skipped.map((s) => `${s.section.replace(/^\d+\.\s*/, "")} (${s.rag})`).join(" · ")}
                </div>
              )}
              {meta && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {(["solution", "vertical", "scope", "content_type", "status", "locale"] as const).map((k) =>
                    meta[k] ? (
                      <span key={k} className="rounded bg-engenius-blue/10 px-1.5 py-0.5 text-[10px] text-engenius-blue">{k}:{String(meta[k])}</span>
                    ) : null,
                  )}
                  {Array.isArray(meta.models) && (meta.models as string[]).length > 0 && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">models:{(meta.models as string[]).length}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose()} disabled={busy} className="text-xs">Cancel</Button>
          <Button variant="outline" size="sm" onClick={() => run(true)} disabled={busy} className="text-xs">
            {busy ? "…" : "Preview"}
          </Button>
          <Button size="sm" onClick={() => run(false)} disabled={busy || !preview} className="text-xs" title={!preview ? "Preview first" : "Index into the shared RAG"}>
            {busy ? "Indexing…" : "Index"}
          </Button>
        </div>
      </div>
    </div>
  );
}
