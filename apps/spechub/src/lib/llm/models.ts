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
