import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@eg/db/settings";
import { listEnabledModels, getModel } from "@eg/llm/models";
import { gate } from "@eg/auth/session";
import {
  PROJECT_EXTRACT_MODEL_DEFAULT,
  PROJECT_INTAKE_MODEL_DEFAULT,
  PROJECT_MODEL_KEYS,
} from "@/lib/llm/models";

/**
 * Which model Tender Datasheets uses for its two AI steps.
 *
 * The catalog — which models exist at all — is still edited in EnGenie
 * (`llm_models`). This only chooses among them, and stores the choice in
 * `app_settings`, so neither app writes a table the other owns.
 *
 * Two settings rather than one because the jobs are different: extraction is
 * long-input transcription with a hard "change nothing" rule, intake is
 * judgement over a short scrappy note. Tuning one should not silently move
 * the other, which is exactly why they were separate constants before.
 */
export async function GET() {
  const denied = await gate("settings.edit_api_keys");
  if (denied) return denied;

  const [intake, extract, models] = await Promise.all([
    getSetting(PROJECT_MODEL_KEYS.intake),
    getSetting(PROJECT_MODEL_KEYS.extract),
    listEnabledModels(),
  ]);

  return NextResponse.json({
    intake: intake ?? PROJECT_INTAKE_MODEL_DEFAULT,
    extract: extract ?? PROJECT_EXTRACT_MODEL_DEFAULT,
    defaults: {
      intake: PROJECT_INTAKE_MODEL_DEFAULT,
      extract: PROJECT_EXTRACT_MODEL_DEFAULT,
    },
    // Slug, label and tier — enough for a picker to be readable without the
    // person having to know what "anthropic/claude-sonnet-4.6" is.
    models: models.map((m) => ({
      slug: m.slug,
      label: m.label,
      tier: m.tier,
      note: m.note,
    })),
  });
}

export async function PUT(request: Request) {
  const denied = await gate("settings.edit_api_keys");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    intake?: string;
    extract?: string;
  };

  const wanted = [
    [PROJECT_MODEL_KEYS.intake, body.intake] as const,
    [PROJECT_MODEL_KEYS.extract, body.extract] as const,
  ].filter(([, slug]) => typeof slug === "string" && slug.length > 0);

  if (wanted.length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  // Checked against the catalog on the way in, not at call time. A slug that
  // does not resolve would otherwise sit in settings looking fine and fail
  // the first time somebody clicked Extract — days later, on somebody else's
  // deadline.
  for (const [, slug] of wanted) {
    if (!(await getModel(slug as string))) {
      return NextResponse.json(
        { error: `目錄裡沒有這個模型：${slug}。請先在 EnGenie 的 Models 設定裡新增。` },
        { status: 400 },
      );
    }
  }

  for (const [key, slug] of wanted) await setSetting(key, slug as string);
  return NextResponse.json({ ok: true });
}
