import { getApiKey } from "@eg/db/settings";
import type { TranslateProvider } from "../types";

// id stays "gemini-2.5-pro" — internal registry/availability key wired
// through translate/index.ts, types.ts, and /api/settings/providers.
// Only the display name + actual model id in the URL change.
export const gemini25Pro: TranslateProvider = {
  id: "gemini-2.5-pro",
  name: "Gemini 3.1 Pro",
  async translate(systemPrompt: string, userMessage: string): Promise<string> {
    const apiKey = await getApiKey("google_ai_api_key", "GOOGLE_AI_API_KEY");
    if (!apiKey) throw new Error("Google AI API Key 尚未設定。請到 Settings 頁面輸入。");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
            // Without an explicit ceiling the response can stop mid-object,
            // leaving unparseable JSON (see the salvage path in index.ts).
            // Feature lists are the long case — 17 bullets plus notes.
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API raw error:", errText);
      // Try to extract a useful message
      try {
        const errJson = JSON.parse(errText);
        const msg = errJson.error?.message || errText;
        throw new Error(`Gemini API error: ${msg}`);
      } catch {
        throw new Error(`Gemini API error: ${res.status} ${errText.slice(0, 200)}`);
      }
    }

    const data = await res.json();

    // Handle safety blocks or empty responses
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked request: ${data.promptFeedback.blockReason}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("Gemini unexpected response:", JSON.stringify(data).slice(0, 500));
      throw new Error("Gemini returned empty response");
    }
    return text;
  },
};
