import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { chatComplete } from "@eg/llm/openrouter";
import { PROJECT_EXTRACT_MODEL } from "@/lib/llm/models";
import { asRawDoc, asRules } from "@/lib/project-datasheet/resolve";
import { findOrphanedRules } from "@/lib/project-datasheet/resolve";
import {
  EXTRACT_SYSTEM,
  buildExtractPrompt,
  parseExtraction,
  readPdf,
  readText,
  readXlsx,
  trimPages,
  type SourceKind,
} from "@/lib/project-datasheet/extract";
import type { RawSpecRow, SpecRules } from "@/lib/project-datasheet/types";
import type { ProjectDatasheetModel } from "@eg/db/types";

/** Uploads are supplier spec sheets, not media. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * POST /api/projects/[id]/extract
 *
 *   multipart { file, modelId }        → read + transcribe, return a preview
 *   json { action:"parse", modelId, text }
 *   json { action:"apply", modelId, sourceId }
 *
 * Parse and apply are split, as everywhere else in this module — but the
 * reason differs. Elsewhere the split protects against a model's judgement;
 * here it protects against a model's REPLACEMENT. Applying overwrites
 * `raw_doc` wholesale, and rules keyed to labels the new reading dropped stop
 * applying. The preview names those rules before anything moves.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();
  const contentType = request.headers.get("content-type") ?? "";

  // ── apply / paste-text (JSON) ──────────────────────────────────────────
  if (!contentType.includes("multipart/form-data")) {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      modelId?: string;
      text?: string;
      sourceId?: string;
    };
    if (!body.modelId) {
      return NextResponse.json({ error: "modelId is required" }, { status: 400 });
    }
    const model = await loadModel(supabase, id, body.modelId);
    if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 });

    if (body.action === "apply") {
      if (!body.sourceId) {
        return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
      }
      const { data: source } = await supabase
        .from("project_datasheet_sources")
        .select("*")
        .eq("id", body.sourceId)
        .eq("project_datasheet_id", id)
        .maybeSingle();
      if (!source) return NextResponse.json({ error: "source not found" }, { status: 404 });

      const rows = ((source.extraction ?? {}) as { rows?: RawSpecRow[] }).rows ?? [];
      if (rows.length === 0) {
        return NextResponse.json({ error: "這份來源沒有抽出任何規格列。" }, { status: 400 });
      }

      // Replaces, deliberately. `raw_doc` is one reading of one source; a
      // merge would blend two readings into a document that matches neither
      // PDF. Human edits live in `rules` and are untouched by this.
      const { error } = await supabase
        .from("project_datasheet_models")
        .update({
          raw_doc: rows as never,
          source_id: body.sourceId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.modelId)
        .eq("project_datasheet_id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ rows: rows.length });
    }

    const text = body.text?.trim();
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
    return preview(supabase, id, model, "text", null, null, readText(text));
  }

  // ── upload (multipart) ─────────────────────────────────────────────────
  const form = await request.formData();
  const file = form.get("file");
  const modelId = String(form.get("modelId") ?? "");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!modelId) return NextResponse.json({ error: "modelId is required" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "檔案超過 20 MB。" }, { status: 413 });
  }

  const model = await loadModel(supabase, id, modelId);
  if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 });

  const name = file.name.toLowerCase();
  const kind: SourceKind = name.endsWith(".pdf")
    ? "pdf"
    : name.endsWith(".xlsx") || name.endsWith(".xlsm")
      ? "xlsx"
      : "text";

  const buf = await file.arrayBuffer();
  let read;
  try {
    read =
      kind === "pdf"
        ? await readPdf(buf)
        : kind === "xlsx"
          ? await readXlsx(buf)
          : readText(new TextDecoder().decode(buf));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "讀不到這個檔案的內容。" },
      { status: 400 },
    );
  }

  // Kept whatever happens next. When a quoted spec is challenged months
  // later, the question is always "where did this number come from", and a
  // transcript without the document it came from is only half an answer.
  const storagePath = `${id}/${crypto.randomUUID()}-${file.name}`;
  await supabase.storage
    .from("project-datasheets")
    .upload(storagePath, buf, { contentType: file.type || "application/octet-stream" });

  return preview(supabase, id, model, kind, file.name, storagePath, read);
}

async function preview(
  supabase: ReturnType<typeof createAdminClient>,
  docId: string,
  model: ProjectDatasheetModel,
  kind: SourceKind,
  filename: string | null,
  storagePath: string | null,
  read: { pages: string[]; full: string },
) {
  let reply: string;
  try {
    reply = await chatComplete({
      model: PROJECT_EXTRACT_MODEL,
      system: EXTRACT_SYSTEM,
      user: buildExtractPrompt(trimPages(read.pages), model.model_name),
      json: true,
      temperature: 0,
      feature: "project-extract",
      ref: model.model_name,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "extraction failed" },
      { status: 502 },
    );
  }

  const { rows, notes } = parseExtraction(reply);

  const { data: source, error } = await supabase
    .from("project_datasheet_sources")
    .insert({
      project_datasheet_id: docId,
      kind,
      filename,
      storage_path: storagePath,
      extracted_text: read.full.slice(0, 400_000),
      extraction: { rows, notes } as never,
      extraction_model: PROJECT_EXTRACT_MODEL,
      extracted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Rules written against labels this reading no longer produces. They do not
  // vanish — they simply stop applying — which is the quiet kind of failure
  // this module exists to make loud: an override that silently stops firing
  // is how a hidden chipset reappears on a tender document.
  const orphans = findOrphanedRules(rows, asRules(model.rules) as SpecRules);

  return NextResponse.json({
    sourceId: source.id,
    rows,
    notes,
    orphans,
    replacing: asRawDoc(model.raw_doc).length,
    lowConfidence: rows.filter((r) => (r.confidence ?? 1) < 0.7).length,
  });
}

async function loadModel(
  supabase: ReturnType<typeof createAdminClient>,
  docId: string,
  modelId: string,
): Promise<ProjectDatasheetModel | null> {
  const { data } = await supabase
    .from("project_datasheet_models")
    .select("*")
    .eq("id", modelId)
    .eq("project_datasheet_id", docId)
    .maybeSingle();
  return (data as ProjectDatasheetModel | null) ?? null;
}
