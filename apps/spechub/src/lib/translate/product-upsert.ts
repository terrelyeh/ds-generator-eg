/**
 * Which columns a POST to /api/translations/product may write.
 *
 * The rule: a column the caller did NOT mention is left out, so an upsert
 * leaves whatever is stored alone. It used to be the opposite — every column
 * was written on every call, reading an absent field as "make it null" — and
 * that turned a second caller with a shorter payload into a data-loss bug.
 *
 * It happened on 2026-09-18, the day after spec footnotes shipped. The
 * editor's Preview button also saves (the preview renders what is stored),
 * but its body was written before footnotes existed and never gained
 * `spec_notes`. So: translate the Japanese footnote, press Preview, and the
 * translation you just made is deleted and the datasheet prints the English
 * one. Nothing failed, nothing was logged, and the editor still showed the
 * Japanese text until the page was reloaded.
 *
 * Both halves are fixed — the editor now sends one payload for Save and
 * Preview — but this is the half that cannot be forgotten again: the next
 * locale-specific column is safe in a caller that predates it.
 *
 * Clearing still works, because "clear" is a value, not an absence: the
 * editor always sends the field, and an empty string becomes null.
 */

/** Text columns of product_translations, trimmed; "" is stored as null. */
export const TRANSLATION_TEXT_COLUMNS = [
  "headline",
  "subtitle",
  "overview",
  "spec_notes",
  "hardware_image",
  "qr_label",
  "qr_url",
] as const;

/**
 * The upsert payload for the columns `body` actually names.
 *
 * `product_id` / `locale` are the conflict target and always written; the
 * route rejects a body without them. `translated_at` and the review columns
 * are the route's business, not a caller's.
 */
export function translationFields(body: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    product_id: body.product_id,
    locale: body.locale,
  };

  // A row created by "enable this locale" has no mode yet; an existing row's
  // mode must not be reset to "light" by a caller that left it out.
  if ("translation_mode" in body) {
    fields.translation_mode = body.translation_mode || "light";
  }

  for (const column of TRANSLATION_TEXT_COLUMNS) {
    if (!(column in body)) continue;
    const value = body[column];
    fields[column] = typeof value === "string" ? value.trim() || null : (value ?? null);
  }

  if ("features" in body) {
    fields.features = Array.isArray(body.features) ? body.features : null;
  }

  return fields;
}
