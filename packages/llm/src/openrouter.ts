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
import { featureTag, type Feature } from "./features";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * One value picks the key AND tags the spend, because the reporting
 * granularity we want is exactly the key split: two keys, two buckets.
 *
 * Two keys by decision (2026-08-06): SpecHub (datasheet translation and
 * battlecard) on one, EnGenie Ask on the other. Ask is the split worth
 * having because it is the surface reachable from public workspaces, the
 * embed widget and the demo page — a leak there should be revocable
 * without taking datasheet generation down, and it is the one that wants
 * its own spend cap. Everything SpecHub does is staff-only, so splitting
 * it further would add rotation work and buy nothing.
 *
 * Finer attribution is still recoverable without a schema change: every
 * ledger row carries `ref` (product model, workspace slug), so "which
 * datasheet was expensive" can be answered from the data whenever it's
 * worth building a view for.
 */
export type Surface = "spechub" | "ask";

const SURFACE_SETTINGS: Record<Surface, string> = {
  spechub: "openrouter_api_key",
  ask: "openrouter_api_key_ask",
};

const SURFACE_ENV: Record<Surface, string> = {
  spechub: "OPENROUTER_API_KEY",
  ask: "OPENROUTER_API_KEY_ASK",
};

/**
 * Resolve the credential: the surface's own key if configured, else the
 * SpecHub key. So Ask degrades to the SpecHub key rather than failing
 * when no Ask key has been set yet.
 *
 * For Ask this is only the bottom of a longer chain — a workspace in
 * `byok` mode carries its own key and `user_byok` takes one per request,
 * both of which override this. Only `shared` workspaces (the Marketing
 * demo among them) land here.
 */
export async function getOpenRouterKey(surface: Surface = "spechub"): Promise<string | null> {
  if (surface !== "spechub") {
    const own = await getApiKey(SURFACE_SETTINGS[surface], SURFACE_ENV[surface]);
    if (own) return own;
  }
  return getApiKey(SURFACE_SETTINGS.spechub, SURFACE_ENV.spechub);
}

/** True when OpenRouter is configured and should be preferred over direct vendor calls. */
export async function openRouterEnabled(surface: Surface = "spechub"): Promise<boolean> {
  return !!(await getOpenRouterKey(surface));
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
  /** Which key pays, and which bucket the spend lands in. Default "spechub". */
  surface?: Surface;
  /**
   * Which feature is spending, one level finer than the key. Required, so a
   * new call site can't silently land in `unmapped` — see ./features.
   */
  feature: Feature;
  /** Free-form attribution: product model, workspace slug, line name… */
  ref?: string;
  /** BYOK override — used instead of the stored key, never persisted. */
  apiKey?: string;
  /**
   * Reasoning effort. "none" is the OpenRouter equivalent of Gemini's
   * thinkingBudget:0 — flash models think BEFORE the first streamed token
   * and the thought parts get discarded anyway, so leaving it on spends
   * 7-15s of visible "generating…" for nothing (pitfall #61).
   */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  /** Skip ledger recording (health checks, throwaway probes). */
  skipRecord?: boolean;
  signal?: AbortSignal;
}

/** Attribution headers OpenRouter uses for its dashboard/leaderboards. */
const ATTRIBUTION = {
  "HTTP-Referer": "https://spechub.engenius.ai",
  "X-Title": "EnGenius Product SpecHub",
};

export async function chatComplete(opts: ChatOptions): Promise<string> {
  const apiKey = opts.apiKey ?? (await getOpenRouterKey(opts.surface ?? "spechub"));
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
      // OpenRouter's `user` is an attribution label, NOT the user message —
      // that one is in `messages` above (ChatOptions.user is the prompt).
      // Wiring opts.user in here would ship prompt text to usage analytics.
      user: featureTag(opts.feature),
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
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

  if (!opts.skipRecord) {
    // Awaited, not fired and forgotten. The old comment said a ledger write
    // must never delay a translation, which is true — but the request has
    // already come back from OpenRouter, so this costs one small insert
    // against a call that took seconds. What it buys is the row actually
    // existing: a serverless instance can be frozen the moment the handler
    // returns, and an un-awaited promise is not a reason to keep it alive.
    // Errors are still swallowed; the answer is worth more than the record.
    await recordUsage(data, opts).catch((e) =>
      console.warn("[openrouter] usage not recorded:", e?.message ?? e),
    );
  }

  return text;
}

/**
 * Append one row to our own spend ledger.
 *
 * The completions response carries `usage.cost` (plus `is_byok`), which is
 * the only reliable per-call cost signal available — OpenRouter's public
 * API cannot break spend down per API key. See 00033_llm_usage_events.sql.
 */
async function recordUsage(
  data: {
    id?: string;
    model?: string;
    usage?: {
      cost?: number;
      is_byok?: boolean;
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  },
  opts: ChatOptions,
): Promise<void> {
  const u = data.usage;
  if (!u) return;

  const { createAdminClient } = await import("@eg/db/admin");
  const supabase = createAdminClient();

  const { error } = await supabase.from("llm_usage_events" as "products").insert({
    surface: opts.surface ?? "spechub",
    // What OpenRouter says it billed, which can differ from what we asked
    // for when a request is routed to a variant.
    model: data.model ?? opts.model,
    cost: u.cost ?? 0,
    prompt_tokens: u.prompt_tokens ?? null,
    completion_tokens: u.completion_tokens ?? null,
    total_tokens: u.total_tokens ?? null,
    // BYOK spend is the workspace's, not ours — kept for volume stats but
    // excluded from company totals.
    is_byok: u.is_byok ?? !!opts.apiKey,
    ref: opts.ref ?? null,
    generation_id: data.id ?? null,
  } as never);

  if (error) throw new Error(error.message);
}

/**
 * Streaming variant — one function for every vendor.
 *
 * Replaces three hand-rolled SSE readers (Anthropic's `content_block_delta`,
 * OpenAI's SDK loop, Gemini's `candidates[].content.parts[]` with its
 * thought-part filtering). OpenRouter normalises all of them to the
 * OpenAI delta shape, so the vendor-specific parsing disappears.
 *
 * Usage still lands in the ledger: OpenRouter always includes a final
 * usage payload in the stream (its `stream_options.include_usage` is
 * deprecated precisely because it's unconditional), so streamed answers
 * are costed the same as non-streamed ones.
 */
export async function streamComplete(
  opts: ChatOptions & { onChunk: (text: string) => void },
): Promise<void> {
  const apiKey = opts.apiKey ?? (await getOpenRouterKey(opts.surface ?? "spechub"));
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
      stream: true,
      // Attribution label, not the user message — see the note in chatComplete.
      user: featureTag(opts.feature),
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status} (${opts.model}): ${(await res.text()).slice(0, 300)}`);
  }
  if (!res.body) throw new Error(`OpenRouter returned no stream (${opts.model})`);

  // An aborted stream never delivers the final usage chunk, so a cancelled
  // answer costs whatever OpenRouter generated before it stopped and is not
  // in our ledger. Nothing can be done about the amount from here; it is
  // noted so the gap is a known one rather than a surprise in the totals.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usagePayload: { id?: string; model?: string; usage?: Record<string, unknown> } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      // OpenRouter emits ": OPENROUTER PROCESSING" comment lines as
      // keepalives during long waits. They are not events.
      if (!line.startsWith("data: ")) continue;

      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;

      try {
        const event = JSON.parse(payload);

        // Rate limits and moderation arrive mid-stream with HTTP 200.
        if (event.error) {
          throw new Error(
            `OpenRouter error (${opts.model}): ${event.error.message ?? JSON.stringify(event.error)}`,
          );
        }

        const text: string | undefined = event.choices?.[0]?.delta?.content;
        if (text) opts.onChunk(text);

        // Usage arrives on a late chunk, usually one with no choices.
        if (event.usage) usagePayload = { id: event.id, model: event.model, usage: event.usage };
      } catch (err) {
        // Re-throw our own error envelope; ignore genuinely unparseable lines.
        if (err instanceof Error && err.message.startsWith("OpenRouter error")) throw err;
      }
    }
  }

  if (usagePayload && !opts.skipRecord) {
    // Same as chatComplete: awaited so the row survives the function ending.
    // This matters more here than anywhere — checking whether Ask is alive
    // means checking whether `llm_usage_events` has new rows, so a ledger
    // that quietly drops writes takes the health signal with it.
    await recordUsage(usagePayload, opts).catch((e) =>
      console.warn("[openrouter] usage not recorded:", e?.message ?? e),
    );
  }
}
