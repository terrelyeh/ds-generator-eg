/**
 * Vision API — Generate text descriptions of images using Gemini Vision.
 * Used to make images searchable in the RAG vector database.
 */

import { getApiKey, API_KEY_MAP } from "@eg/db/settings";
import { isTransientHttpStatus } from "./safe-url";

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

/** A description, or why there is none and whether trying again could help. */
type ImageDescription =
  | { ok: true; text: string }
  | { ok: false; retry: boolean; reason: string };

/**
 * Generate a text description of an image using Gemini Vision.
 *
 * Failures are sorted, because the caller acts on the difference: a missing
 * image or a file Gemini refuses will fail the same way next week, while a
 * timeout, a rate limit or a server error may not — and a page must not be
 * stored without a description it could still get (see gitbook-plan
 * `visionState`).
 */
async function describeImage(imageUrl: string, apiKey: string): Promise<ImageDescription> {
  let stage = "image fetch";
  try {
    // Fetch the image and convert to base64
    const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!imageRes.ok) {
      return {
        ok: false,
        retry: isTransientHttpStatus(imageRes.status),
        reason: `image HTTP ${imageRes.status}`,
      };
    }

    const contentType = imageRes.headers.get("content-type") || "image/png";
    const arrayBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Call Gemini Vision API
    stage = "Gemini";
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
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        // 400/413 are this file (unsupported or too large). Anything else —
        // a rate limit, an outage, a key problem — is not the image's fault.
        retry: res.status !== 400 && res.status !== 413,
        reason: `Gemini HTTP ${res.status} ${errText.slice(0, 120)}`.trim(),
      };
    }

    const data = await res.json();

    // Extract text from response (handle thinking parts like in ask/route.ts)
    const parts = data.candidates?.[0]?.content?.parts;
    const textParts = (parts ?? []).filter((p: { text?: string }) => p.text !== undefined);
    const text: string | undefined = textParts[textParts.length - 1]?.text?.trim();
    // No text back (a safety block, say) will be no text next time too.
    return text ? { ok: true, text } : { ok: false, retry: false, reason: "Gemini returned no text" };
  } catch (err) {
    // A timeout or a dropped connection: worth another try on a later run.
    return { ok: false, retry: true, reason: `${stage}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface DescribedImages {
  /** url → description, or null when it failed in a way that will fail again. */
  descriptions: Map<string, string | null>;
  /** Failures worth another try (timeouts, rate limits, 5xx, no API key). Not in `descriptions`. */
  retry: { url: string; reason: string }[];
}

/**
 * Describe multiple images, with concurrency control.
 *
 * With a `deadline` (epoch ms), no new round starts once it has passed. An
 * image the run did not reach is in neither `descriptions` nor `retry`.
 */
export async function describeImages(
  imageUrls: string[],
  concurrency = 3,
  deadline?: number,
): Promise<DescribedImages> {
  const descriptions = new Map<string, string | null>();
  const retry: DescribedImages["retry"] = [];
  const unique = [...new Set(imageUrls)];
  if (unique.length === 0) return { descriptions, retry };

  // A missing key is configuration, not the images: describing them without
  // it would store every page with no descriptions, and fingerprint them so
  // they were never described once the key was set.
  const apiKey = await getApiKey("google_ai_api_key", API_KEY_MAP.google_ai_api_key);
  if (!apiKey) {
    console.warn("Google AI API key not configured — image descriptions postponed");
    return { descriptions, retry: unique.map((url) => ({ url, reason: "Google AI API key not configured" })) };
  }

  // Process in batches to avoid rate limits
  for (let i = 0; i < unique.length; i += concurrency) {
    if (deadline !== undefined && Date.now() >= deadline) break;
    const batch = unique.slice(i, i + concurrency);
    const outcomes = await Promise.all(batch.map((url) => describeImage(url, apiKey)));
    batch.forEach((url, j) => {
      const outcome = outcomes[j];
      if (outcome.ok) {
        descriptions.set(url, outcome.text);
        return;
      }
      console.warn(`Image description failed for ${url} (${outcome.retry ? "will retry" : "permanent"}): ${outcome.reason}`);
      if (outcome.retry) retry.push({ url, reason: outcome.reason });
      else descriptions.set(url, null);
    });
  }

  return { descriptions, retry };
}
