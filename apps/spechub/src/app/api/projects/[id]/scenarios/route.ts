import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { chatComplete } from "@eg/llm/openrouter";
import { getProjectScenariosModel } from "@/lib/llm/models";
import { resolveMatrix } from "@/lib/project-datasheet/resolve";
import {
  SCENARIOS_SYSTEM,
  buildScenarioPrompt,
  parseScenarios,
  specLines,
} from "@/lib/project-datasheet/scenarios";
import type { BlankMode, DocRules, ModelImage } from "@/lib/project-datasheet/types";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

/**
 * POST /api/projects/[id]/scenarios — { term, count } → drafted copy.
 *
 * READ-ONLY on purpose, and more strictly than intake: intake at least files
 * the note as a source, this writes nothing at all. The drafts come back to
 * the browser, land in the same caption fields a person types into, and are
 * still saved by the same button. There is no path from this endpoint to the
 * document — which means there is no version of "the AI changed our datasheet
 * and nobody clicked anything".
 *
 * The grounding is the whole feature: the model is handed the RESOLVED spec
 * table (raw ⊕ rules, blanks removed) and forbidden to state anything absent
 * from it. See `scenarios.ts` for the sentence that made that rule necessary.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { term?: string; count?: number };
  const term = body.term?.trim();
  if (!term) {
    return NextResponse.json({ error: "先填一個產業或場域，例如 retail。" }, { status: 400 });
  }
  // Clamped rather than rejected: the picker only offers 2-5 and a number
  // outside it is a caller bug, not something to fail a person's click on.
  const count = Math.min(5, Math.max(2, Math.round(body.count ?? 4)));

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

  const llmModel = await getProjectScenariosModel();
  let reply: string;
  try {
    reply = await chatComplete({
      model: llmModel,
      system: SCENARIOS_SYSTEM,
      user: buildScenarioPrompt({
        term,
        count,
        doc: {
          headline: doc.headline,
          seriesName: doc.series_name,
          category: doc.category_label,
          overview: doc.overview,
        },
        modelNames,
        specLines: lines,
        existing: existingHeadings(doc.images),
      }),
      json: true,
      // Not 0. Four scenarios have to differ from each other, and a run at 0
      // returns four ways of saying the same thing about connectivity.
      temperature: 0.4,
      feature: "project-scenarios",
      ref: doc.name,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation failed" },
      { status: 502 },
    );
  }

  // The table's labels, so a basis that names no row is caught here rather
  // than trusted onto a customer's document.
  const proposal = parseScenarios(reply, rows.map((r) => r.label));
  if (proposal.scenarios.length === 0) {
    return NextResponse.json(
      { error: "模型沒有回傳可用的內容，再按一次試試。" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ...proposal, model: llmModel, specRows: lines.length });
}

/**
 * Headings already on the document's pictures, so a second run adds sites
 * instead of rewriting the four that are already approved.
 */
function existingHeadings(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images.flatMap((i) => {
    const caption = (i as ModelImage)?.caption;
    if (typeof caption !== "string" || !caption.trim()) return [];
    const at = caption.indexOf("—");
    return [(at > 0 ? caption.slice(0, at) : caption).trim()];
  });
}
