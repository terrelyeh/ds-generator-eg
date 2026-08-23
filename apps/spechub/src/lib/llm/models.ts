/**
 * OpenRouter model slugs for spechub's non-translation LLM work.
 *
 * Translation models live in lib/translate/types.ts (AVAILABLE_PROVIDERS)
 * because they're user-selectable; these are fixed engineering choices.
 *
 * Slugs verified against GET https://openrouter.ai/api/v1/models (2026-08-06).
 */

/**
 * Battlecard competitor-spec extraction (↻ sync and 🔍 web).
 *
 * Same model the direct Anthropic client asked for — but those routes
 * never actually ran: they hard-require anthropic_api_key, which has
 * never existed in app_settings or on Vercel, so both buttons have been
 * returning 400 in production since launch. OpenRouter is what finally
 * makes them work, which is why there's no direct fallback here.
 */
export const BATTLECARD_EXTRACT_MODEL = "anthropic/claude-sonnet-4.6";

/**
 * Tender Datasheets requirements intake.
 *
 * The job is reading a scrappy bilingual note from sales and deciding which
 * lines are actionable rules and which are questions — judgement over a short
 * input, which is what the mid-tier model is for. Same slug as battlecard
 * extraction because it is the same kind of task at the same stakes: it
 * proposes, a human confirms.
 */
export const PROJECT_INTAKE_MODEL_DEFAULT = "anthropic/claude-sonnet-4.6";

/**
 * Tender Datasheets source extraction.
 *
 * Long-input transcription with a hard "change nothing" rule — a different
 * job from intake's short-input judgement, so it gets its own constant even
 * though the slug currently matches. Tuning one should not silently move the
 * other.
 */
export const PROJECT_EXTRACT_MODEL_DEFAULT = "anthropic/claude-sonnet-4.6";

/**
 * Tender Datasheets application-scenario copy.
 *
 * Short output, but the judgement is the hard part. It writes selling copy
 * while refusing to state any figure the spec table does not already carry —
 * and the failure mode is not a bad sentence, it is a GOOD one: "a second
 * carrier stands by" reads beautifully and describes hardware nobody agreed
 * to build. That sentence was in this document until we took it out by hand.
 * So: same tier as the other two, not the cheap model.
 */
export const PROJECT_SCENARIOS_MODEL_DEFAULT = "anthropic/claude-sonnet-4.6";

/**
 * Settings keys holding the chosen slugs, and the resolvers the routes call.
 *
 * The constants above stay as the DEFAULTS rather than the values: an empty
 * setting, a settings row somebody deleted, or a database that is briefly
 * unreachable should leave these two features working on a known-good model,
 * not fail at the moment a person clicks Extract.
 *
 * The catalog itself — which models exist at all — is still edited in EnGenie
 * (`llm_models`). This picks one of them; it does not invent slugs. A slug
 * that has since been removed from the catalog is caught on save, not at
 * call time.
 */
export const PROJECT_MODEL_KEYS = {
  intake: "project_intake_model",
  extract: "project_extract_model",
  scenarios: "project_scenarios_model",
} as const;

export async function getProjectIntakeModel(): Promise<string> {
  const { getSetting } = await import("@eg/db/settings");
  return (await getSetting(PROJECT_MODEL_KEYS.intake)) ?? PROJECT_INTAKE_MODEL_DEFAULT;
}

export async function getProjectExtractModel(): Promise<string> {
  const { getSetting } = await import("@eg/db/settings");
  return (await getSetting(PROJECT_MODEL_KEYS.extract)) ?? PROJECT_EXTRACT_MODEL_DEFAULT;
}

export async function getProjectScenariosModel(): Promise<string> {
  const { getSetting } = await import("@eg/db/settings");
  return (await getSetting(PROJECT_MODEL_KEYS.scenarios)) ?? PROJECT_SCENARIOS_MODEL_DEFAULT;
}
