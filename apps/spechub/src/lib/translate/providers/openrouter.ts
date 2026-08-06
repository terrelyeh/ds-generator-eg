import { chatComplete } from "@eg/llm/openrouter";
import type { TranslateProvider } from "../types";

/**
 * One factory for every model. The three direct-vendor files each existed
 * only because the request shapes differed; through OpenRouter they don't,
 * so a new model is a row in AVAILABLE_PROVIDERS rather than a new file.
 *
 * max_tokens 8192 matches what the Gemini client needed — feature lists
 * run long (17 bullets plus the translator's notes) and a 4096 ceiling
 * truncated the JSON mid-object, which is what the salvage path in
 * ../index.ts exists to catch.
 *
 * response_format is deliberately NOT requested. Only the old Gemini
 * client asked for structured output; Claude and OpenAI never did and
 * parsed fine, support varies by model, and an unsupported value is a
 * 400 rather than a graceful degrade. The prompt already demands bare
 * JSON and the salvage path handles the rest.
 */
export function createOpenRouterProvider(
  id: string,
  name: string,
  model: string
): TranslateProvider {
  return {
    id,
    name,
    async translate(systemPrompt: string, userMessage: string): Promise<string> {
      return chatComplete({
        model,
        system: systemPrompt,
        user: userMessage,
        maxTokens: 8192,
        temperature: 0.3,
      });
    },
  };
}
