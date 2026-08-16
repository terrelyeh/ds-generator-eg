/**
 * Feature tags — the string sent as OpenRouter's `user` parameter.
 *
 * OpenRouter groups usage by whatever arrives in `user`, which buys a
 * breakdown BELOW the API key without a second key, a schema change or any
 * new architecture. Shape is `<project>.<tool>.<feature>`:
 *
 *   engenius-spechub   fixed prefix, so our rows can never collide with
 *                      another project's on the same account
 *   engenie | dsgen    which key paid — one segment per OpenRouter key,
 *                      mirroring `Surface` in ./openrouter
 *   <feature>          what the spend bought
 *
 * The last two segments are read by a human on a dashboard with no lookup
 * table beside it (a table would drift from this file, so there deliberately
 * isn't one). They have to make sense alone: `battlecard`, never `step2`.
 *
 * `user` affects analytics only — not model behaviour, not billing. And
 * OpenRouter's activity view only reaches back ~31 days, so this answers
 * "what are we spending on lately", not "what did we spend last quarter".
 * The historical record is our own ledger, `llm_usage_events`.
 */

/**
 * Every feature that can reach OpenRouter.
 *
 * Adding a call site means adding a key here — `feature` is a required
 * option on every entry point, so a new call site that skips this table
 * fails to compile rather than landing silently in `unmapped`.
 */
export type Feature = "ask" | "translate" | "battlecard" | "budget-check";

export const FEATURE_TAGS: Record<Feature, string> = {
  /**
   * EnGenie Ask — the RAG answer stream, from every entry point: internal
   * /ask, department workspaces, the embed widget (SpecHub's side panel
   * among them) and the demo. One bucket on purpose: to OpenRouter this is
   * a single job, and which entry point asked is already recorded as `ref`
   * in our own ledger.
   *
   * Retrieval is NOT in here and can't be — embeddings go to OpenAI direct
   * (see the note at the top of ./openrouter), so they never appear in
   * OpenRouter usage under any tag.
   */
  ask: "engenius-spechub.engenie.ask",

  /**
   * Datasheet translation — headline, overview, features, spec labels and
   * review comments. One API serving six buttons, so one bucket.
   */
  translate: "engenius-spechub.dsgen.translate",

  /**
   * Competitor battlecard spec extraction — both the ↻ datasheet re-sync
   * and the 🔍 web search fill.
   */
  battlecard: "engenius-spechub.dsgen.battlecard",

  /**
   * scripts/check-translation-budget.ts — a real translation, run by hand
   * against the production key. Kept out of `translate` so trial runs don't
   * inflate what translation actually costs in production.
   */
  "budget-check": "engenius-spechub.dsgen.budget-check",
};

/**
 * Where an unrecognised feature lands.
 *
 * A broken tag must never break the call it labels, so this is a fallback
 * and not a throw — attribution is metadata, the translation isn't.
 * Spend appearing under `unmapped` means a call site is missing from the
 * table above; `npm run check:feature-tags` is what stops that shipping.
 */
export const UNMAPPED_TAG = "engenius-spechub.unmapped";

/** Look up a feature's tag. Never throws; unknown input → UNMAPPED_TAG. */
export function featureTag(feature: string | null | undefined): string {
  if (!feature) return UNMAPPED_TAG;
  return FEATURE_TAGS[feature as Feature] ?? UNMAPPED_TAG;
}
