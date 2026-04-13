/**
 * Vision API — Generate text descriptions of images using Gemini Vision.
 * Used to make images searchable in the RAG vector database.
 */

import { getApiKey, API_KEY_MAP } from "@/lib/settings";

const VISION_MODEL = "gemini-2.5-flash";

const DESCRIPTION_PROMPT = `You are describing an image from EnGenius networking product documentation.
Your description will be embedded into a vector database for semantic search.

Rules:
- Describe what the image shows in 2-4 sentences
- If it's a UI screenshot, describe the key elements, settings, and workflow shown
- If it's a diagram/architecture, describe the components and their relationships
- If it's a table/chart, describe the data structure and key values
- Include any text visible in the image that would be useful for search
- Be factual and specific — mention product names, feature names, menu paths if visible
- Write in English for consistent embedding quality
- Do NOT start with "This image shows" — just describe directly`;

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
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      console.warn(`Failed to fetch image ${imageUrl}: ${imageRes.status}`);
      return null;
    }

    const contentType = imageRes.headers.get("content-type") || "image/png";
    const arrayBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Call Gemini Vision API
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
            maxOutputTokens: 300,
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
 */
export async function describeImages(
  imageUrls: string[],
  concurrency = 3
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const unique = [...new Set(imageUrls)];

  // Process in batches to avoid rate limits
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const descriptions = await Promise.all(
      batch.map((url) => describeImage(url))
    );
    batch.forEach((url, j) => results.set(url, descriptions[j]));
  }

  return results;
}
