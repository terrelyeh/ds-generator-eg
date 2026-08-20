import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { chatComplete } from "@eg/llm/openrouter";
import { PROJECT_INTAKE_MODEL } from "@/lib/llm/models";
import { asRawDoc } from "@/lib/project-datasheet/resolve";
import { applyItems } from "@/lib/project-datasheet/apply-items";
import {
  INTAKE_SYSTEM,
  buildIntakePrompt,
  parseProposal,
  type IntakeItem,
  type IntakeProposal,
} from "@/lib/project-datasheet/intake";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

/**
 * POST /api/projects/[id]/intake
 *
 *   { action: "parse", text }                  → propose (writes only the source row)
 *   { action: "apply", sourceId, accept: [i] } → merge the accepted items
 *
 * Split in two on purpose. Parsing is a suggestion and must be reviewable
 * before anything moves; applying is a deliberate act on a named subset. One
 * endpoint that did both would make "the model read our note" and "the model
 * rewrote our tender document" the same click.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    text?: string;
    sourceId?: string;
    accept?: number[];
  };

  const supabase = createAdminClient();

  const [{ data: docRow }, { data: modelRows }] = await Promise.all([
    supabase.from("project_datasheets").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("project_datasheet_models")
      .select("*")
      .eq("project_datasheet_id", id)
      .order("position"),
  ]);
  const doc = docRow as ProjectDatasheet | null;
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const models = (modelRows ?? []) as ProjectDatasheetModel[];

  if (body.action === "apply") return apply(supabase, id, doc, models, body);

  // ── parse ──────────────────────────────────────────────────────────────
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
  if (models.length === 0) {
    return NextResponse.json(
      { error: "先加至少一個型號，規則才有對象可以套。" },
      { status: 400 },
    );
  }

  const specKeys = dedupeKeys(models);
  let reply: string;
  try {
    reply = await chatComplete({
      model: PROJECT_INTAKE_MODEL,
      system: INTAKE_SYSTEM,
      user: buildIntakePrompt({
        note: text,
        modelNames: models.map((m) => m.model_name),
        specKeys,
      }),
      json: true,
      temperature: 0,
      feature: "project-intake",
      ref: doc.name,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "intake failed" },
      { status: 502 },
    );
  }

  const proposal = parseProposal(
    reply,
    models.map((m) => m.model_name),
  );
  annotateReplacements(proposal.items, models);

  // Stored before anyone accepts anything: the note is a source, and what we
  // were told matters even when we decide to act on none of it.
  const { data: source, error } = await supabase
    .from("project_datasheet_sources")
    .insert({
      project_datasheet_id: id,
      kind: "requirements",
      filename: null,
      extracted_text: text,
      extraction: { proposal, applied: [] } as never,
      extraction_model: PROJECT_INTAKE_MODEL,
      extracted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sourceId: source.id, proposal });
}

async function apply(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  doc: ProjectDatasheet,
  models: ProjectDatasheetModel[],
  body: { sourceId?: string; accept?: number[] },
) {
  if (!body.sourceId) return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
  const accept = Array.isArray(body.accept) ? body.accept : [];
  if (accept.length === 0) return NextResponse.json({ error: "nothing selected" }, { status: 400 });

  const { data: sourceRow } = await supabase
    .from("project_datasheet_sources")
    .select("*")
    .eq("id", body.sourceId)
    .eq("project_datasheet_id", id)
    .maybeSingle();
  if (!sourceRow) return NextResponse.json({ error: "source not found" }, { status: 404 });

  const stored = (sourceRow.extraction ?? {}) as { proposal?: IntakeProposal };
  const items = stored.proposal?.items ?? [];
  const chosen = accept.map((i) => items[i]).filter(Boolean) as IntakeItem[];
  if (chosen.length === 0) {
    return NextResponse.json({ error: "selection matched no items" }, { status: 400 });
  }

  const result = await applyItems(supabase, id, doc, models, chosen);

  await supabase
    .from("project_datasheet_sources")
    .update({ extraction: { ...stored, applied: accept } as never })
    .eq("id", body.sourceId);

  return NextResponse.json(result);
}

/**
 * Fill in what each item would overwrite.
 *
 * The failure this exists for: a proposal to record "PoE is 802.3af/at" that
 * lands as an override on `interface` — deleting the LAN port, reset button
 * and SIM slots — reads as entirely sensible in a review list. Showing the
 * value being replaced is what turns it back into an obvious mistake.
 */
function annotateReplacements(items: IntakeItem[], models: ProjectDatasheetModel[]): void {
  const perModel = new Map(
    models.map((m) => [m.model_name, new Map(asRawDoc(m.raw_doc).map((r) => [r.key, r.value]))]),
  );
  const anywhere = new Map<string, string>();
  for (const [, rows] of perModel) {
    for (const [key, value] of rows) if (!anywhere.has(key)) anywhere.set(key, value);
  }

  for (const item of items) {
    switch (item.type) {
      case "doc_override":
        item.replaces = anywhere.get(item.key) ?? null;
        break;
      case "model_override":
      case "model_add":
        item.replaces = perModel.get(item.modelName)?.get(item.key) ?? null;
        break;
      default:
        item.replaces = null;
    }
  }
}

/** Every spec key in the document, so the model proposes against real rows. */
function dedupeKeys(models: ProjectDatasheetModel[]): { key: string; label: string }[] {
  const out = new Map<string, string>();
  for (const m of models) {
    for (const row of asRawDoc(m.raw_doc)) {
      if (!out.has(row.key)) out.set(row.key, row.label);
    }
  }
  return [...out].map(([key, label]) => ({ key, label }));
}
