/**
 * Citation markers, normalised to the one form the chat surfaces understand.
 *
 * Retrieved text reaches the model wrapped as <source id="Source N" …> (the
 * data boundary from PR #61), and the prompt asks for "[1]"-style citations.
 * Some models copy the id instead: Gemini 3.7 Flash wrote "[Source 7]" for all
 * 10 citations of one answer, where 3.5 wrote "[7]" for all 8 of the same.
 * Nothing downstream recognised that form — the widget printed it as text
 * instead of stripping it, ask-chat didn't turn it into a tooltip, and
 * AnswerFigures found no citations, so it showed no images.
 *
 * Both surfaces run each message through this once before rendering, so any
 * model works, and history saved before the fix renders correctly too.
 */

/** [Source 7] · [Source 1, Source 3] · [Sources 1、2] · 【Source 2】 */
const SOURCE_CITE_RE = /[[【]\s*Sources?\s*\d+(?:\s*[,，、]\s*(?:Sources?\s*)?\d+)*\s*[\]】]/gi;

export function normalizeCitations(text: string): string {
  return text.replace(SOURCE_CITE_RE, (m) => `[${(m.match(/\d+/g) ?? []).join(", ")}]`);
}

/**
 * Remove inline citation markers, for surfaces that list sources elsewhere
 * (the widget and extension show them in「參考了 N 則資料」). Takes the spaces
 * in front of a marker with it — "設定 [7]。" must become "設定。", not
 * "設定 。"; Gemini 3.7 puts a space before every citation — but never a
 * newline. Expects normalised input (run normalizeCitations first).
 */
export function stripCitations(text: string): string {
  return text.replace(/[ \t]*\[\d+(?:\s*,\s*\d+)*\]/g, "");
}
