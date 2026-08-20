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
 *   deal fields,      ending, and a stale salesperson or a quantity from
 *   status            another tender is worse than a blank field
 *   disclaimer        REGENERATED for the new customer — it names them
 *   sources           NOT copied; the new document points at the same specs
 *                     but its own provenance starts today
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

  const [{ data: docRow }, { data: modelRows }, { data: questionRows }] = await Promise.all([
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
      disclaimer: defaultDisclaimer(customer),
      image_note: source.image_note,
      sections: source.sections as never,
      blank_policy: source.blank_policy,
      doc_rules: source.doc_rules as never,
      notes: null,
      deal_stage: "inquiry",
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const models = (modelRows ?? []) as ProjectDatasheetModel[];
  const oldToNew = new Map<string, string>();

  if (models.length > 0) {
    const { data: newModels, error: modelError } = await supabase
      .from("project_datasheet_models")
      .insert(
        models.map((m) => ({
          project_datasheet_id: created.id,
          // Not carried: it points at a source row belonging to the old
          // document, and following it would attribute this copy's provenance
          // to a file uploaded under a different deal.
          source_id: null,
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
