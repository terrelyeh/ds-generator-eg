import { getApiKey } from "@/lib/settings";
import type { TranslateProvider } from "../types";

// id stays "gpt-4o" — it's the internal registry/availability key wired
// through translate/index.ts, types.ts, and /api/settings/providers.
// Only the display name + actual model string change.
export const gpt4o: TranslateProvider = {
  id: "gpt-4o",
  name: "GPT-5.5",
  async translate(systemPrompt: string, userMessage: string): Promise<string> {
    const apiKey = await getApiKey("openai_api_key", "OPENAI_API_KEY");
    if (!apiKey) throw new Error("OpenAI API Key 尚未設定。請到 Settings 頁面輸入。");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        // GPT-5 series only accepts the default temperature (1); passing
        // the old 0.3 → 400 error. Omit it entirely.
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from OpenAI");
    return text;
  },
};
