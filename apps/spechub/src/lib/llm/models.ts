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
export const PROJECT_INTAKE_MODEL = "anthropic/claude-sonnet-4.6";

/**
 * Tender Datasheets source extraction.
 *
 * Long-input transcription with a hard "change nothing" rule — a different
 * job from intake's short-input judgement, so it gets its own constant even
 * though the slug currently matches. Tuning one should not silently move the
 * other.
 */
export const PROJECT_EXTRACT_MODEL = "anthropic/claude-sonnet-4.6";
