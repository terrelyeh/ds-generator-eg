import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate } from "@/lib/auth/session";
import { ingestFile } from "@/lib/rag/ingest-file";
import { type TaxonomyMeta } from "@/lib/rag/taxonomy";

// PDF read by Gemini + embedding can take a while.
export const maxDuration = 300;
export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — Vercel caps the request body at ~4.5 MB
const BUCKET = "knowledge-files";
const PDF = "application/pdf";

/** Colon-free, stable source_id for a file (the documents GET splits on ":"). */
function fileSourceId(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 8);
  return `file-${base || "doc"}-${rand}`;
}

/**
 * POST /api/documents/upload  (multipart/form-data)
 * Fields: file (PDF), label?, taxonomy? (JSON string).
 * Reads the PDF with Gemini (tables → Markdown, figures described, scanned →
 * OCR), stores the original in the private bucket, then indexes the text.
 */
export async function POST(request: Request) {
  const denied = await gate("knowledge.edit");
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload (expected multipart form)" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  }

  const name = file.name || "document";
  const isPdf = file.type === PDF || name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 415 });
  }

  const label = (form.get("label") as string | null)?.trim() || undefined;
  let taxonomy: Partial<TaxonomyMeta> | undefined;
  const taxRaw = form.get("taxonomy");
  if (typeof taxRaw === "string" && taxRaw) {
    try { taxonomy = JSON.parse(taxRaw); } catch { /* ignore malformed taxonomy */ }
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Read the PDF with Gemini (tables → Markdown, figures described, scanned →
  // OCR). Fall back to unpdf text-layer extraction if AI extraction is
  // unavailable, so clean-text PDFs never hard-fail.
  let text = "";
  let extractMethod: "gemini" | "text" = "text";
  let truncated = false;
  try {
    const { extractPdfMarkdown } = await import("@/lib/rag/extract-pdf-ai");
    const md = await extractPdfMarkdown(buf);
    if (md && md.markdown.length >= 20) {
      text = md.markdown;
      extractMethod = "gemini";
      truncated = md.truncated;
    } else {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text: t } = await extractText(pdf, { mergePages: true });
      text = Array.isArray(t) ? t.join("\n\n") : t;
      extractMethod = "text";
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }

  text = (text || "").trim();
  if (text.length < 20) {
    return NextResponse.json(
      { error: "Couldn't extract any text from this PDF. If it's scanned, check that the Google AI key is configured (used for OCR)." },
      { status: 422 },
    );
  }

  const sourceId = fileSourceId(name);
  const supabase = createAdminClient();

  // Store the original (private bucket, service-role only). Non-fatal if it
  // fails — we still index the text, just without a downloadable original.
  const storagePath = `${sourceId}.pdf`;
  let storedPath: string | null = null;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buf, { contentType: PDF, upsert: true });
  if (upErr) console.error("knowledge-files upload error:", upErr);
  else storedPath = storagePath;

  try {
    const result = await ingestFile({
      sourceId,
      fileName: name,
      fileType: "pdf",
      fileSize: file.size,
      storagePath: storedPath,
      text,
      label,
      taxonomy,
      extractMethod,
    });
    return NextResponse.json({ ok: true, source_id: sourceId, stored: !!storedPath, extract_method: extractMethod, truncated, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: `File ingest failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
