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

/**
 * Which surface is spending. Each can hold its own OpenRouter key so spend
 * is attributable and a leak is separately revocable — Ask especially,
 * since it is reachable from public workspaces, the embed widget and the
 * demo page, while datasheet generation is staff-only.
 *
 * Purpose-specific keys are OPT-IN: an unset purpose falls back to the
 * shared key, so adding a purpose never breaks a surface that has no key
 * of its own.
 */
export type KeyPurpose = "default" | "ask" | "translate";

const PURPOSE_SETTINGS_KEY: Record<KeyPurpose, string> = {
  default: "openrouter_api_key",
  ask: "openrouter_api_key_ask",
  translate: "openrouter_api_key_translate",
};

const PURPOSE_ENV: Record<KeyPurpose, string> = {
  default: "OPENROUTER_API_KEY",
  ask: "OPENROUTER_API_KEY_ASK",
  translate: "OPENROUTER_API_KEY_TRANSLATE",
};

/**
 * Resolve the key for a surface: its own key if configured, else the
 * shared one.
 *
 * For Ask this is only the bottom of a longer chain — a workspace in
 * `byok` mode carries its own key and `user_byok` takes one per request,
 * both of which override this. Only `shared` workspaces (the Marketing
 * demo among them) land here.
 */
export async function getOpenRouterKey(purpose: KeyPurpose = "default"): Promise<string | null> {
  if (purpose !== "default") {
    const own = await getApiKey(PURPOSE_SETTINGS_KEY[purpose], PURPOSE_ENV[purpose]);
    if (own) return own;
  }
  return getApiKey(PURPOSE_SETTINGS_KEY.default, PURPOSE_ENV.default);
}

/** True when OpenRouter is configured and should be preferred over direct vendor calls. */
export async function openRouterEnabled(purpose: KeyPurpose = "default"): Promise<boolean> {
  return !!(await getOpenRouterKey(purpose));
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
  /** Which surface is spending — picks that surface's key. See KeyPurpose. */
  purpose?: KeyPurpose;
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
  const apiKey = opts.apiKey ?? (await getOpenRouterKey(opts.purpose ?? "default"));
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
