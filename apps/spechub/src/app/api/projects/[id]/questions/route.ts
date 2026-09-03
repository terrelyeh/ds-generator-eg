import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate, getCurrentUser } from "@eg/auth/session";
import { resolveMatrix } from "@/lib/project-datasheet/resolve";
import {
  findingId,
  scanDocument,
  storedFindingId,
  type Finding,
} from "@/lib/project-datasheet/gap-scan";
import { buildBrief, type BriefFinding } from "@/lib/project-datasheet/brief";
import { chatComplete } from "@eg/llm/openrouter";
import { getProjectIntakeModel } from "@/lib/llm/models";
import { sanitizeItems, type IntakeItem } from "@/lib/project-datasheet/intake";
import { applyItems } from "@/lib/project-datasheet/apply-items";
import {
  ANSWER_SYSTEM,
  annotateReplacements,
  blankRows,
  buildAnswerPrompt,
  currentValues,
} from "@/lib/project-datasheet/answer";
import type { BlankMode, DocRules, ResolvedRow } from "@/lib/project-datasheet/types";
import type {
  ProjectDatasheet,
  ProjectDatasheetModel,
  ProjectDatasheetQuestion,
} from "@eg/db/types";

/**
 * GET /api/projects/[id]/questions — rescan and reconcile.
 *
 * The scan is the source of truth for WHAT is wrong; the table is the source
 * of truth for what a human has done about it. Reconciling on read (rather
 * than on a save hook) means the list can never be stale relative to the
 * document — you edit a spec, reload, and the finding it fixed is gone.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.view");
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: docRow }, { data: modelRows }, { data: questionRows }] = await Promise.all([
    supabase.from("project_datasheets").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("project_datasheet_models")
      .select("*")
      .eq("project_datasheet_id", id)
      .order("position"),
    supabase.from("project_datasheet_questions").select("*").eq("project_datasheet_id", id),
  ]);

  const doc = docRow as ProjectDatasheet | null;
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const models = (modelRows ?? []) as ProjectDatasheetModel[];
  const stored = (questionRows ?? []) as ProjectDatasheetQuestion[];

  const [sourceText, catalogModels] = await Promise.all([
    loadSourceText(supabase, id),
    loadCatalogModels(supabase, id, models),
  ]);

  const rows = resolveMatrix({
    models,
    docRules: (doc.doc_rules ?? {}) as DocRules,
    blankPolicy: (doc.blank_policy as BlankMode) ?? "tbd",
  });
  const findings = scanDocument({ doc, models, rows, sourceText, catalogModels });

  const byId = new Map(stored.map((q) => [storedFindingId(q), q]));
  const live = new Set(findings.map(findingId));

  // New findings, and ones that came back after being resolved.
  const inserts: Record<string, unknown>[] = [];
  const revivals: string[] = [];
  for (const f of findings) {
    const existing = byId.get(findingId(f));
    if (!existing) {
      inserts.push({
        project_datasheet_id: id,
        code: f.code,
        model_id: f.modelId,
        row_key: f.rowKey,
        title: f.title,
        detail: f.detail,
        asked_of: f.askedOf,
      });
    } else if (existing.state === "resolved") {
      revivals.push(existing.id);
    }
  }

  // Findings that no longer fire. Resolved, not deleted — the trail of what
  // was asked and how it settled is how a spec commitment gets defended six
  // months later.
  //
  // `intake:` rows are exempt: they came from a person reading sales' note,
  // not from a check, so the scanner has no basis for deciding they are
  // settled. Reconciling them would close every question intake raised on the
  // very next page load.
  const resolved = stored
    .filter(
      (q) =>
        q.state !== "resolved" &&
        !isIntake(q.code) &&
        !live.has(storedFindingId(q)),
    )
    .map((q) => q.id);

  await Promise.all([
    inserts.length
      ? supabase.from("project_datasheet_questions").insert(inserts as never)
      : Promise.resolve(),
    revivals.length
      ? supabase
          .from("project_datasheet_questions")
          .update({ state: "open", updated_at: new Date().toISOString() })
          .in("id", revivals)
      : Promise.resolve(),
    resolved.length
      ? supabase
          .from("project_datasheet_questions")
          .update({ state: "resolved", updated_at: new Date().toISOString() })
          .in("id", resolved)
      : Promise.resolve(),
  ]);

  const { data: finalRows } = await supabase
    .from("project_datasheet_questions")
    .select("*")
    .eq("project_datasheet_id", id);
  const final = new Map(
    ((finalRows ?? []) as ProjectDatasheetQuestion[]).map((q) => [storedFindingId(q), q]),
  );

  // Severity and kind come from the scanner every time, never from the row —
  // a rule whose severity changes must not leave old rows carrying the old one.
  const merged: (BriefFinding & { id: string })[] = findings.map((f: Finding) => {
    const row = final.get(findingId(f));
    return {
      ...f,
      id: row?.id ?? "",
      state: (row?.state ?? "open") as BriefFinding["state"],
      answer: row?.answer ?? null,
    };
  });

  // Questions intake raised have no scanner finding behind them, so they have
  // to be folded in by hand or they would exist in the table and nowhere else.
  const fromIntake: (BriefFinding & { id: string })[] = ((finalRows ?? []) as ProjectDatasheetQuestion[])
    .filter((q) => isIntake(q.code) && q.state !== "resolved")
    .map((q) => ({
      code: q.code,
      // Advisory, always. A question sales asked is the document being
      // incomplete, not the document being wrong — the same line the rest of
      // the review draws.
      kind: "missing" as const,
      severity: "advisory" as const,
      askedOf: q.asked_of as BriefFinding["askedOf"],
      modelId: q.model_id,
      rowKey: q.row_key,
      title: q.title,
      detail: q.detail,
      id: q.id,
      state: q.state as BriefFinding["state"],
      answer: q.answer,
    }));
  merged.push(...fromIntake);

  const openFindings = merged.filter((f) => f.state === "open");
  return NextResponse.json({
    findings: merged,
    counts: {
      open: openFindings.length,
      blocking: openFindings.filter((f) => f.severity === "blocking").length,
      advisory: openFindings.filter((f) => f.severity === "advisory").length,
      answered: merged.filter((f) => f.state === "answered").length,
    },
    brief: buildBrief({
      docName: doc.name,
      customer: doc.customer,
      findings: merged,
      date: new Date().toISOString().slice(0, 10),
    }),
  });
}

/**
 * Fold one spec row into another.
 *
 * The plan is re-derived here rather than accepted from the browser. The
 * pairing rule lives in `spec-align`, and a second copy of it — even one that
 * only has to agree about which rows these are — is a second thing that can
 * be wrong about a customer-facing spec table. The client sends which finding
 * and which direction; the server decides what that means.
 *
 * `swap` flips which label survives. The default is a guess (our own
 * catalogue wording, else the first column's), and a guess offered as a
 * one-way door is worse than one with a way back.
 */
async function merge(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  doc: ProjectDatasheet,
  models: ProjectDatasheetModel[],
  rows: ResolvedRow[],
  question: ProjectDatasheetQuestion,
  swap: boolean,
) {
  const findings = scanDocument({
    doc,
    models,
    rows,
    sourceText: await loadSourceText(supabase, id),
    catalogModels: await loadCatalogModels(supabase, id, models),
  });
  // Identity is (code, modelId, rowKey), never code alone. One split produces
  // a pair per target row, and all of them share `same_spec_split:<fromKey>` —
  // so with three or more columns, matching on code folds the wrong pair and
  // reports it under the card the user did not click.
  const wanted = storedFindingId(question);
  const plan = findings.find((f) => findingId(f) === wanted)?.merge;
  if (!plan) {
    return NextResponse.json(
      { error: "這兩列已經不成對了——按「重新檢查」看目前的狀況。" },
      { status: 409 },
    );
  }

  const intoKey = swap ? plan.fromKey : plan.intoKey;
  const fromKey = swap ? plan.intoKey : plan.fromKey;
  const intoRow = rows.find((r) => r.key === intoKey);
  const fromRow = rows.find((r) => r.key === fromKey);
  if (!intoRow || !fromRow) {
    return NextResponse.json({ error: "找不到那兩列了" }, { status: 409 });
  }

  const at = rows.findIndex((r) => r.key === intoKey);
  const after = at > 0 ? rows[at - 1].key : null;

  const items: IntakeItem[] = [];
  fromRow.cells.forEach((cell, i) => {
    const model = models[i];
    if (!model || cell.isBlank || !cell.value.trim()) return;
    // Hidden on this model only. `doc_hide` would take the row away from a
    // third column that legitimately uses that wording.
    items.push({
      type: "model_hide",
      modelName: model.model_name,
      key: fromKey,
      because: `合併進「${intoRow.label}」`,
    });
    // The VALUE moves verbatim. Re-filing a fact is not the same as editing
    // it, and a merge that also tidied the text would be doing the one thing
    // this module refuses to do to a source.
    items.push({
      type: "model_add",
      modelName: model.model_name,
      key: intoKey,
      label: intoRow.label,
      value: cell.value,
      after,
      because: `原本在「${fromRow.label}」`,
    });
  });

  if (items.length === 0) {
    return NextResponse.json({ error: "沒有值需要搬" }, { status: 409 });
  }

  // Apply first, answer second. Marking the question answered before the write
  // lands leaves `openBlockers()` counting a merge that never happened as
  // settled, and the spec table is the thing the customer reads.
  const result = await applyItems(supabase, id, doc, models, items);

  const user = await getCurrentUser();
  await supabase
    .from("project_datasheet_questions")
    .update({
      state: "answered",
      answer: `合併成一列：「${fromRow.label}」→「${intoRow.label}」`,
      answered_by: user?.id ?? null,
      answered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", question.id)
    .eq("project_datasheet_id", id);

  return NextResponse.json({ ...result, into: intoRow.label, from: fromRow.label });
}

/**
 * The extracted text of every spec source on this document.
 *
 * `requirements` sources are excluded: sales' own note is where half these
 * values came from, so treating it as independent corroboration would have
 * the scanner cite our own instruction back at us as if the supplier had
 * said it.
 */
async function loadSourceText(
  supabase: ReturnType<typeof createAdminClient>,
  docId: string,
): Promise<string> {
  const { data } = await supabase
    .from("project_datasheet_sources")
    .select("extracted_text, kind")
    .eq("project_datasheet_id", docId);
  return ((data ?? []) as { extracted_text: string | null; kind: string }[])
    .filter((s) => s.kind !== "requirements" && s.extracted_text)
    .map((s) => s.extracted_text as string)
    .join("\n\n");
}

/** Model ids whose rows were seeded from a shipping product. */
async function loadCatalogModels(
  supabase: ReturnType<typeof createAdminClient>,
  docId: string,
  models: ProjectDatasheetModel[],
): Promise<Set<string>> {
  const sourceIds = models.map((m) => m.source_id).filter((v): v is string => !!v);
  if (sourceIds.length === 0) return new Set();
  const { data } = await supabase
    .from("project_datasheet_sources")
    .select("id, kind")
    .eq("project_datasheet_id", docId)
    .in("id", sourceIds);
  const catalog = new Set(
    ((data ?? []) as { id: string; kind: string }[])
      .filter((s) => s.kind === "catalog")
      .map((s) => s.id),
  );
  return new Set(models.filter((m) => m.source_id && catalog.has(m.source_id)).map((m) => m.id));
}

/** Questions raised by requirements intake, not by a scanner check. */
function isIntake(code: string): boolean {
  return code.startsWith("intake:");
}

/** PATCH — record an answer, dismiss, or reopen one question. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    questionId?: string;
    state?: string;
    answer?: string;
  };
  if (!body.questionId) {
    return NextResponse.json({ error: "questionId is required" }, { status: 400 });
  }
  if (!body.state || !["open", "answered", "dismissed"].includes(body.state)) {
    return NextResponse.json({ error: "state must be open|answered|dismissed" }, { status: 400 });
  }
  if (body.state === "answered" && !body.answer?.trim()) {
    return NextResponse.json({ error: "an answer is required" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("project_datasheet_questions")
    .update({
      state: body.state,
      answer: body.state === "open" ? null : (body.answer?.trim() ?? null),
      answered_by: body.state === "open" ? null : (user?.id ?? null),
      answered_at: body.state === "open" ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.questionId)
    .eq("project_datasheet_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * POST — turn an answer into proposed rules, then apply the ticked ones.
 *
 *   { action: "propose", questionId, answer }        → { items }
 *   { action: "apply", questionId, answer, items }   → applies + marks answered
 *   { action: "merge", questionId, swap? }           → folds one spec row
 *                                                      into another
 *
 * Split for the same reason intake is: reading an answer and rewriting the
 * document must not be one click. The proposal comes back for review with
 * every overwrite spelled out, and only the ticked subset is applied.
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
    questionId?: string;
    answer?: string;
    items?: unknown;
    swap?: boolean;
  };
  const answer = body.answer?.trim();
  // `merge` carries no prose — the action IS the answer.
  if (!body.questionId || (!answer && body.action !== "merge")) {
    return NextResponse.json({ error: "questionId and answer are required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const [{ data: docRow }, { data: modelRows }, { data: questionRow }] = await Promise.all([
    supabase.from("project_datasheets").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("project_datasheet_models")
      .select("*")
      .eq("project_datasheet_id", id)
      .order("position"),
    supabase
      .from("project_datasheet_questions")
      .select("*")
      .eq("id", body.questionId)
      .eq("project_datasheet_id", id)
      .maybeSingle(),
  ]);

  const doc = docRow as ProjectDatasheet | null;
  const question = questionRow as ProjectDatasheetQuestion | null;
  if (!doc || !question) return NextResponse.json({ error: "not found" }, { status: 404 });

  const models = (modelRows ?? []) as ProjectDatasheetModel[];
  const modelNames = models.map((m) => m.model_name);
  const rows = resolveMatrix({
    models,
    docRules: (doc.doc_rules ?? {}) as DocRules,
    blankPolicy: (doc.blank_policy as BlankMode) ?? "tbd",
  });

  if (body.action === "merge") return merge(supabase, id, doc, models, rows, question, !!body.swap);

  if (body.action === "apply") {
    const items = sanitizeItems(body.items, modelNames);
    const user = await getCurrentUser();
    // The answer is filed whether or not it produced an edit. Most answers to
    // a doubt-class question are confirmations, and "RD said the housing is
    // rated IP67" is exactly the sentence someone will want six months later.
    await supabase
      .from("project_datasheet_questions")
      .update({
        state: "answered",
        answer,
        answered_by: user?.id ?? null,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.questionId)
      .eq("project_datasheet_id", id);

    const result = items.length
      ? await applyItems(supabase, id, doc, models, items)
      : { applied: 0, questions: 0 };
    return NextResponse.json(result);
  }

  // ── propose ────────────────────────────────────────────────────────────
  const llmModel = await getProjectIntakeModel();
  let reply: string;
  try {
    reply = await chatComplete({
      model: llmModel,
      system: ANSWER_SYSTEM,
      user: buildAnswerPrompt({
        questionTitle: question.title,
        questionDetail: question.detail,
        answer: answer ?? "",
        rowKey: question.row_key,
        modelNames,
        current: currentValues(rows, question.row_key, modelNames),
        blanks: blankRows(rows, modelNames),
      }),
      json: true,
      temperature: 0,
      feature: "project-intake",
      ref: doc.name,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "propose failed" },
      { status: 502 },
    );
  }

  const items = sanitizeItems(extractItems(reply), modelNames);
  annotateReplacements(items, rows, modelNames);
  return NextResponse.json({ items });
}

/** Pull the `items` array out of a reply that may be fenced or padded. */
function extractItems(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    return (JSON.parse(body.slice(start, end + 1)) as { items?: unknown }).items ?? [];
  } catch {
    return [];
  }
}
