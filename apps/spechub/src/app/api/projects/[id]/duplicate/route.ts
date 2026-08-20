import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate, getCurrentUser } from "@eg/auth/session";
import { defaultDisclaimer } from "@/lib/project-datasheet/themes";
import type {
  ProjectDatasheet,
  ProjectDatasheetModel,
  ProjectDatasheetQuestion,
} from "@eg/db/types";

/**
 * POST /api/projects/[id]/duplicate { name, customer? }
 *
 * The same hardware, quoted to the next customer.
 *
 * What carries over and what doesn't is the whole design here:
 *
 *   raw_doc + rules   COPIED — the spec work is the expensive part and the
 *                     hardware hasn't changed
 *   answered/dismissed
 *   questions         COPIED — "RD confirmed the housing is IP67" is a fact
 *                     about the product, not about the deal. Re-asking it of
 *                     the same engineer next month is how a review list
 *                     teaches people to click through it
 *   open questions    DROPPED — they re-derive on the first scan, and copying
 *                     them would strand rows keyed to the OLD model ids
 *   customer, notes,  RESET — every one of these belongs to the deal that is
 *   internal fields,  ending, and a stale salesperson or a tender date from
 *   status            another bid is worse than a blank field
 *   disclaimer        RESET to the neutral default
 *   sources           COPIED — the source sheet is the BASELINE the rules are
 *                     a delta against, and the review degrades silently
 *                     without it (see below)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    customer?: string;
  };

  const supabase = createAdminClient();
  const user = await getCurrentUser();

  const [{ data: docRow }, { data: modelRows }, { data: questionRows }, { data: sourceRows }] =
    await Promise.all([
    supabase.from("project_datasheets").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("project_datasheet_models")
      .select("*")
      .eq("project_datasheet_id", id)
      .order("position"),
    supabase
      .from("project_datasheet_questions")
      .select("*")
      .eq("project_datasheet_id", id)
      .in("state", ["answered", "dismissed"]),
    supabase
      .from("project_datasheet_sources")
      .select("*")
      .eq("project_datasheet_id", id),
  ]);

  const source = docRow as ProjectDatasheet | null;
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  const customer = body.customer?.trim() || null;
  const name = body.name?.trim() || `${source.name}（複製）`;

  const { data: created, error } = await supabase
    .from("project_datasheets")
    .insert({
      name,
      customer,
      status: "draft",
      layout: source.layout,
      headline: source.headline,
      series_name: source.series_name,
      category_label: source.category_label,
      overview: source.overview,
      features: source.features as never,
      footnote: source.footnote,
      images: source.images as never,
      disclaimer: defaultDisclaimer(),
      image_note: source.image_note,
      sections: source.sections as never,
      blank_policy: source.blank_policy,
      doc_rules: source.doc_rules as never,
      notes: null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /**
   * Sources come along, and their ids are remapped onto the copies.
   *
   * They were left behind at first, on the reasoning that a new deal starts
   * its own provenance. That was wrong once the workflow became clear: the
   * source sheet is the BASELINE the rules are a delta against — it is what
   * the sourced vendor currently builds, and the edits on top are what the
   * customer additionally needs. A copy without it keeps the deltas and
   * loses what they are deltas from.
   *
   * It also degrades the review silently. `source_prose_conflict` needs the
   * source text ("the overview says IP66"), and catalogue-seeded columns are
   * recognised by their source's `kind` — both quietly fall back to vaguer
   * findings when the link is gone, with nothing to say they have.
   */
  const sources = (sourceRows ?? []) as { id: string; [k: string]: unknown }[];
  const sourceIdMap = new Map<string, string>();
  if (sources.length > 0) {
    const { data: newSources } = await supabase
      .from("project_datasheet_sources")
      .insert(
        sources.map((src) => ({
          project_datasheet_id: created.id,
          kind: src.kind,
          filename: src.filename,
          // The uploaded file itself is shared, not re-uploaded: it is the
          // same document, and a second copy would drift if either were
          // replaced.
          storage_path: src.storage_path,
          extracted_text: src.extracted_text,
          extraction: src.extraction,
          extraction_model: src.extraction_model,
          extracted_at: src.extracted_at,
        })) as never,
      )
      .select("id, filename, kind, extracted_at");
    // Matched on the tuple that identifies a source within one document;
    // insert order is not guaranteed to come back in order.
    const pool = [...((newSources ?? []) as { id: string; filename: string | null; kind: string; extracted_at: string | null }[])];
    for (const src of sources) {
      const i = pool.findIndex(
        (n) =>
          n.kind === src.kind &&
          n.filename === (src.filename ?? null) &&
          n.extracted_at === (src.extracted_at ?? null),
      );
      if (i >= 0) sourceIdMap.set(src.id, pool.splice(i, 1)[0].id);
    }
  }

  const models = (modelRows ?? []) as ProjectDatasheetModel[];
  const oldToNew = new Map<string, string>();

  if (models.length > 0) {
    const { data: newModels, error: modelError } = await supabase
      .from("project_datasheet_models")
      .insert(
        models.map((m) => ({
          project_datasheet_id: created.id,
          source_id: m.source_id ? (sourceIdMap.get(m.source_id) ?? null) : null,
          position: m.position,
          model_name: m.model_name,
          display_name: m.display_name,
          subtitle: m.subtitle,
          overview: m.overview,
          features: m.features as never,
          images: m.images as never,
          raw_doc: m.raw_doc as never,
          rules: m.rules as never,
        })) as never,
      )
      .select("id, model_name");
    if (modelError) return NextResponse.json({ error: modelError.message }, { status: 500 });

    const byName = new Map(
      ((newModels ?? []) as { id: string; model_name: string }[]).map((m) => [m.model_name, m.id]),
    );
    for (const m of models) {
      const next = byName.get(m.model_name);
      if (next) oldToNew.set(m.id, next);
    }
  }

  const settled = (questionRows ?? []) as ProjectDatasheetQuestion[];
  const carried = settled
    // A row keyed to a model id that no longer exists would never match a
    // finding again — it would sit in the settled list forever, describing a
    // column nobody can see.
    .filter((q) => !q.model_id || oldToNew.has(q.model_id))
    .map((q) => ({
      project_datasheet_id: created.id,
      code: q.code,
      model_id: q.model_id ? oldToNew.get(q.model_id)! : null,
      row_key: q.row_key,
      state: q.state,
      answer: q.answer,
      answered_by: q.answered_by,
      answered_at: q.answered_at,
      title: q.title,
      detail: q.detail,
      asked_of: q.asked_of,
    }));

  if (carried.length > 0) {
    await supabase.from("project_datasheet_questions").insert(carried as never);
  }

  return NextResponse.json({
    id: created.id,
    models: models.length,
    carriedAnswers: carried.length,
  });
}
