import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gateWithRateLimit } from "@eg/auth/session";
import { chatComplete } from "@eg/llm/openrouter";
import { getProjectCoverModel } from "@/lib/llm/models";
import { resolveMatrix } from "@/lib/project-datasheet/resolve";
import { specLines } from "@/lib/project-datasheet/grounding";
import { COVER_SYSTEM, buildCoverPrompt, parseCover } from "@/lib/project-datasheet/cover-copy";
import type { BlankMode, DocRules } from "@/lib/project-datasheet/types";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

/**
 * POST /api/projects/[id]/cover — { hint? } → drafted cover copy.
 *
 * READ-ONLY, like the scenario drafter and for the same reason: the draft
 * lands in the same boxes a person types into, unsaved, under the same Save
 * button. There is no path from this endpoint to the document.
 *
 * Only worth pressing on the ODM path. A document seeded from a catalogue
 * model already carries our own approved English — see `seedCoverCopy` in
 * seed-from-product. Nothing stops you running it there; it just has better
 * words already.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gateWithRateLimit("project_datasheet.edit", { key: "tender-cover", max: 10, windowSeconds: 60 });
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { hint?: string };

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

  if (models.length === 0) {
    return NextResponse.json(
      { error: "先加至少一個型號。沒有規格表的話，寫出來的東西沒有東西可以擋著它。" },
      { status: 400 },
    );
  }

  const rows = resolveMatrix({
    models,
    docRules: (doc.doc_rules ?? {}) as DocRules,
    blankPolicy: (doc.blank_policy as BlankMode) ?? "tbd",
  });
  const modelNames = models.map((m) => m.model_name);
  const lines = specLines(rows, modelNames);

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "規格表目前是空的（或整份都還是 TBD），沒有可以引用的規格。" },
      { status: 400 },
    );
  }

  const llmModel = await getProjectCoverModel();
  let reply: string;
  try {
    reply = await chatComplete({
      model: llmModel,
      system: COVER_SYSTEM,
      user: buildCoverPrompt({
        modelNames,
        specLines: lines,
        existing: {
          headline: doc.headline,
          categoryLabel: doc.category_label,
          overview: doc.overview,
          diagramNote: doc.diagram_note,
        },
        hint: body.hint ?? "",
      }),
      json: true,
      // Not 0. Three or four benefit blocks have to be about different things,
      // and a run at 0 returns the spec table with verbs added.
      temperature: 0.4,
      feature: "project-cover",
      ref: doc.name,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation failed" },
      { status: 502 },
    );
  }

  const draft = parseCover(reply, rows.map((r) => r.label));
  if (!draft) {
    return NextResponse.json({ error: "模型沒有回傳可用的內容，再按一次試試。" }, { status: 502 });
  }

  return NextResponse.json({
    ...draft,
    // Not from the model — it is just the column names, and asking a language
    // model to join two strings with a slash is how you get a hallucinated
    // third model number on the cover.
    seriesName: modelNames.join(" / "),
    model: llmModel,
    specRows: lines.length,
  });
}
