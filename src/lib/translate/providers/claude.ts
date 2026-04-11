import { getApiKey } from "@/lib/settings";
import type { TranslateProvider } from "../types";

function createClaudeProvider(modelId: string, name: string): TranslateProvider {
  return {
    id: modelId,
    name,
    async translate(systemPrompt: string, userMessage: string): Promise<string> {
      const apiKey = await getApiKey("anthropic_api_key", "ANTHROPIC_API_KEY");
      if (!apiKey) throw new Error("Anthropic API Key 尚未設定。請到 Settings 頁面輸入。");

      const model = modelId === "claude-opus"
        ? "claude-opus-4-6"
        : "claude-sonnet-4-6";

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claude API error: ${res.status} ${err}`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text;
      if (!text) throw new Error("Empty response from Claude");
      return text;
    },
  };
}

export const claudeSonnet = createClaudeProvider("claude-sonnet", "Claude Sonnet 4.6");
export const claudeOpus = createClaudeProvider("claude-opus", "Claude Opus 4.6");
