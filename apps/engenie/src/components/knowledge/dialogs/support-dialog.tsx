"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { postIngest } from "../shared";

/**
 * Index PRE-REFINED support articles — the offline refinery's output
 * (`/dev/RAG` → clustered, PII-scrubbed, frontmatter-tagged `.md`). Upload one
 * or more `.md` files and/or paste a single article; the body is sent verbatim
 * and the server parses each file's frontmatter (title, taxonomy, models).
 *
 * No taxonomy picker: visibility is forced internal-only by `ingestSupport`
 * (kind='knowledge' area) and the rest comes from frontmatter — these are
 * curated, already-reviewed artifacts, not free-form snippets.
 */
export function SupportDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [paste, setPaste] = useState("");
  const [indexing, setIndexing] = useState(false);

  const fileCount = files.length;
  const hasInput = fileCount > 0 || paste.trim().length > 0;

  async function handleIndex() {
    if (!hasInput) { toast.error("Choose .md files or paste an article"); return; }
    setIndexing(true);
    try {
      const fromFiles = await Promise.all(files.map(async (f) => ({ markdown: await f.text() })));
      const articles = [...fromFiles, ...(paste.trim() ? [{ markdown: paste }] : [])]
        .filter((a) => a.markdown.trim());
      if (articles.length === 0) { toast.error("No article content found"); setIndexing(false); return; }

      const data = await postIngest({ source_type: "support", articles });
      if (data.ok) {
        const articleCount = Array.isArray(data.articles) ? data.articles.length : 0;
        const chunks = (data.totalProcessed as number) ?? 0;
        const skippedArr = Array.isArray(data.skipped) ? data.skipped : [];
        const skipMsg = skippedArr.length ? `, ${skippedArr.length} skipped` : "";
        toast.success(`Indexed ${articleCount} article${articleCount === 1 ? "" : "s"} → ${chunks} chunks${skipMsg}`);
        onSuccess();
        onClose();
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIndexing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !indexing && onClose()}>
      <div className="bg-background rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add Support Knowledge</h2>
          <button onClick={() => !indexing && onClose()} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={indexing}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3 mb-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Upload <strong>refined</strong> <code>.md</code> articles from the support refinery
            (<code>/dev/RAG</code> → clustered, PII-scrubbed). Title, taxonomy and models are read
            from each file&apos;s frontmatter; everything here is indexed <strong>internal-only</strong>
            {" "}(never exposed via the external Search API).
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Refined Markdown files <span className="text-red-500">*</span></label>
            <input type="file"
              accept=".md,.markdown,text/markdown"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              disabled={indexing}
              className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-engenius-blue/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-engenius-blue hover:file:bg-engenius-blue/20" />
            <p className="mt-1 text-[11px] text-muted-foreground/50">Select multiple <code>.md</code> files (each must include its <code>--- frontmatter ---</code>).</p>
            {fileCount > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">{fileCount} file{fileCount === 1 ? "" : "s"} selected</p>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/40">
            <span className="h-px flex-1 bg-border" /> or paste one article <span className="h-px flex-1 bg-border" />
          </div>

          <div>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)}
              placeholder={"---\nid: INTERCOM-CLUSTER-...\ntitle: \"...\"\nsource: intercom\n---\n\n## Overview\n..."}
              rows={8}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" disabled={indexing} />
          </div>
        </div>

        {indexing && (
          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-4 w-4 rounded-full border-2 border-engenius-blue/30 border-t-engenius-blue animate-spin" />
              <span>Chunking and generating embeddings...</span>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose()} disabled={indexing} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleIndex} disabled={!hasInput || indexing} className="text-xs">
            {indexing ? "Indexing..." : "Index"}
          </Button>
        </div>
      </div>
    </div>
  );
}
