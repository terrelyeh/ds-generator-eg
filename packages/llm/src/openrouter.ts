/**
 * OpenRouter chat client — one key, one endpoint, any vendor's model.
 *
 * Replaces three near-identical direct-vendor clients (Anthropic messages,
 * OpenAI chat/completions, Gemini generateContent) that each needed their
 * own key. Switching model becomes a string change; adding a vendor needs
 * no code at all.
 *
 * NOT for embeddings. RAG embeddings stay on OpenAI direct
 * (apps/engenie/src/lib/rag/embeddings.ts) for two reasons: OpenRouter
 * serves chat completions, not embeddings, and changing the embedding
 * model would invalidate every 1536-dim vector already in pgvector —
 * a full re-index of GitBook, Help Center, support and product corpora.
 * `openai_api_key` therefore stays configured even after this migration.
 */
import { getApiKey } from "@eg/db/settings";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Settings key + env fallback for the single OpenRouter credential. */
export async function getOpenRouterKey(): Promise<string | null> {
  return getApiKey("openrouter_api_key", "OPENROUTER_API_KEY");
}

/** True when OpenRouter is configured and should be preferred over direct vendor calls. */
export async function openRouterEnabled(): Promise<boolean> {
  return !!(await getOpenRouterKey());
}

export interface ChatOptions {
  /** Fully-qualified OpenRouter slug, e.g. "anthropic/claude-sonnet-4.6". */
  model: string;
  system?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Request a JSON object back. Support varies per model, so callers that
   * can tolerate prose (all current ones parse defensively) should leave
   * this off rather than risk a 400 from a model that lacks it.
   */
  json?: boolean;
  /** BYOK override — used instead of the stored key, never persisted. */
  apiKey?: string;
  signal?: AbortSignal;
}

/** Attribution headers OpenRouter uses for its dashboard/leaderboards. */
const ATTRIBUTION = {
  "HTTP-Referer": "https://spechub.engenius.ai",
  "X-Title": "EnGenius Product SpecHub",
};

export async function chatComplete(opts: ChatOptions): Promise<string> {
  const apiKey = opts.apiKey ?? (await getOpenRouterKey());
  if (!apiKey) {
    throw new Error(
      "OpenRouter API Key 尚未設定。請到 Settings 頁面輸入，或設定 OPENROUTER_API_KEY。",
    );
  }

  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...ATTRIBUTION,
    },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      messages,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status} (${opts.model}): ${await res.text()}`);
  }

  const data = await res.json();

  // OpenRouter can answer 200 with an error envelope — upstream rate limits
  // and moderation land here rather than on the HTTP status.
  if (data.error) {
    const msg = data.error.message ?? JSON.stringify(data.error);
    throw new Error(`OpenRouter error (${opts.model}): ${msg}`);
  }

  const text: string | undefined = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(
      `OpenRouter returned no content (${opts.model}): ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return text;
}
