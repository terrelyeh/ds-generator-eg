/**
 * Vision API — Generate text descriptions of images using Gemini Vision.
 * Used to make images searchable in the RAG vector database.
 */

import { getApiKey, API_KEY_MAP } from "@eg/db/settings";

const VISION_MODEL = "gemini-3.5-flash";

/**
 * Neither call had a timeout, and the weekly re-crawl waits on every one of
 * them: a single image that never answered held the function until Vercel
 * killed it at 300s, with nothing written. Generous next to the usual few
 * seconds — a full LED table is 2000 output tokens — but finite.
 */
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const GENERATE_TIMEOUT_MS = 40_000;

const DESCRIPTION_PROMPT = `You are describing an image from EnGenius networking product documentation.
Your description will be embedded into a vector database for semantic search.

CRITICAL — table handling:
- If the image contains ANY table (LED status table, spec table, comparison table, pin-out, etc.),
  extract the ENTIRE table as a Markdown table. Do NOT summarize. Every row, every column.
- Preserve cell text exactly: LED color names (PWR Orange, LAN Blue, 2.4GHz Blue, 5GHz Green, Mesh Blue),
  behavior labels (Solid On, Flashing, Fast Flashing, Flashing 0.5 Sec, 1.5 sec on -> 0.5 sec off),
  and status meanings (Connecting to Cloud, Cloud Connected, LAN Connected, LAN Transmitting,
  Firmware Upgrading, Reset to Default, AP Locating Mode, Mesh Connection, Mesh Auto Pairing, etc.).
- After the table, add ONE sentence naming the product context if visible (e.g., "LED behavior table for ECW536 Cloud Access Point.").

For non-table images:
- UI screenshot → 2-4 sentences describing key elements, settings, menu paths, workflow.
- Diagram/architecture → 2-4 sentences on components and relationships.
- Photo of product/hardware → describe physical features, ports, indicators.

General rules:
- Be factual and specific — mention product names, feature names, menu paths when visible.
- Include any visible text that would help search.
- Write in English for consistent embedding quality.
- Do NOT start with "This image shows" — just describe or extract directly.`;

/**
 * Generate a text description of an image using Gemini Vision.
 *
 * @param imageUrl - URL of the image to describe
 * @returns Text description of the image, or null if failed
 */
export async function describeImage(imageUrl: string): Promise<string | null> {
  const apiKey = await getApiKey("google_ai_api_key", API_KEY_MAP.google_ai_api_key);
  if (!apiKey) {
    console.warn("Google AI API key not configured — skipping image description");
    return null;
  }

  try {
    // Fetch the image and convert to base64
    const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!imageRes.ok) {
      console.warn(`Failed to fetch image ${imageUrl}: ${imageRes.status}`);
      return null;
    }

    const contentType = imageRes.headers.get("content-type") || "image/png";
    const arrayBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Call Gemini Vision API
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent`,
      {
        method: "POST",
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: DESCRIPTION_PROMPT },
                {
                  inlineData: {
                    mimeType: contentType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            // Large tables (e.g. 12-row LED behavior table) need room;
            // bumped from 300 so full table extraction fits.
            maxOutputTokens: 2000,
            temperature: 0.2,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`Gemini Vision API error: ${res.status} — ${errText.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();

    // Extract text from response (handle thinking parts like in ask/route.ts)
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) return null;

    const textParts = parts.filter((p: { text?: string }) => p.text !== undefined);
    return textParts[textParts.length - 1]?.text?.trim() ?? null;
  } catch (err) {
    console.warn(`Image description failed for ${imageUrl}:`, err);
    return null;
  }
}

/**
 * Describe multiple images, with concurrency control.
 * Returns a Map of imageUrl → description (null if failed).
 *
 * With a `deadline` (epoch ms), no new round starts once it has passed, and
 * the images not reached are simply ABSENT from the map — distinct from
 * null, which means "tried and failed". Callers use the difference to hold
 * back a page rather than write it without its descriptions.
 */
export async function describeImages(
  imageUrls: string[],
  concurrency = 3,
  deadline?: number,
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const unique = [...new Set(imageUrls)];

  // Process in batches to avoid rate limits
  for (let i = 0; i < unique.length; i += concurrency) {
    if (deadline !== undefined && Date.now() >= deadline) break;
    const batch = unique.slice(i, i + concurrency);
    const descriptions = await Promise.all(
      batch.map((url) => describeImage(url))
    );
    batch.forEach((url, j) => results.set(url, descriptions[j]));
  }

  return results;
}
