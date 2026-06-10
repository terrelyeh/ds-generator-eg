/**
 * AI PDF extraction — send the whole PDF to Gemini and get clean Markdown back,
 * with tables preserved as Markdown tables, figures/diagrams described, and
 * scanned (image-only) pages OCR'd. Gemini reads `application/pdf` inlineData
 * natively, so this needs no canvas/OCR dependency. Mirrors the Gemini setup in
 * lib/rag/vision.ts (same key + model family).
 *
 * Returns null on any failure so the caller can fall back to plain text-layer
 * extraction (unpdf) rather than losing the upload.
 */

import { getApiKey, API_KEY_MAP } from "@/lib/settings";

const MODEL = "gemini-3.5-flash";

const PDF_PROMPT = `You are converting an EnGenius networking PDF (datasheet, manual, guide, spec sheet) into clean Markdown for a search knowledge base.

Rules:
- Output the document content as well-structured Markdown, in reading order.
- TABLES: render EVERY table as a GitHub-flavored Markdown table. Keep all rows and columns and the exact cell text — spec names, values, units, model numbers. Never summarize or drop rows.
- FIGURES / diagrams / photos / charts: replace each with a one-line italic description on its own line, e.g. "_Figure: deployment diagram — an ESG620 gateway uplinks to an ECS1528P switch feeding three ECW230 access points._". Include any text/labels visible in the figure.
- Use Markdown headings (#, ##, ###) for sections.
- Skip pure decoration: running page headers/footers, page numbers, repeated logos.
- Keep model numbers, spec values and units EXACTLY as written.
- Output ONLY the Markdown — no preamble such as "Here is the markdown".`;

export interface PdfExtractResult {
  markdown: string;
  /** True if Gemini hit the output-token cap and the tail of the PDF was cut off. */
  truncated: boolean;
}

export async function extractPdfMarkdown(pdf: Buffer): Promise<PdfExtractResult | null> {
  const apiKey = await getApiKey("google_ai_api_key", API_KEY_MAP.google_ai_api_key);
  if (!apiKey) {
    console.warn("Google AI API key not configured — skipping AI PDF extraction");
    return null;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PDF_PROMPT },
                { inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 32768, temperature: 0.1 },
        }),
      },
    );

    if (!res.ok) {
      console.warn(`Gemini PDF extract error: ${res.status} — ${(await res.text()).slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const cand = data.candidates?.[0] as { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string } | undefined;
    const parts = cand?.content?.parts;
    if (!parts) return null;
    const text = parts
      .filter((p) => p.text !== undefined && !p.thought)
      .map((p) => p.text)
      .join("")
      .trim();
    if (!text) return null;
    return { markdown: text, truncated: cand?.finishReason === "MAX_TOKENS" };
  } catch (err) {
    console.warn("Gemini PDF extract failed:", err);
    return null;
  }
}
