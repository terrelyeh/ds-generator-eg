import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/rag/embeddings";
import { getApiKey, API_KEY_MAP } from "@/lib/settings";
import { getPersona, listPersonas, USER_PROFILES } from "@/lib/rag/personas";
import { matchesTaxonomyFilter, extractTaxonomy, type TaxonomyMeta } from "@/lib/rag/taxonomy";

// Allow up to 60s for RAG queries (embedding + vector search + LLM)
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AskRequest {
  question: string;
  source_type?: string;
  product_line?: string;
  /** Unified taxonomy filter — scopes retrieval to solution/product_lines/models */
  taxonomy?: Partial<TaxonomyMeta>;
  provider?: string;
  persona?: string;
  profile?: string;
  history?: ChatMessage[];
}

/**
 * GET /api/ask
 * Returns list of available personas.
 */
export async function GET() {
  const personas = await listPersonas();

  // Fetch welcome config from app_settings
  const supabase = createAdminClient();
  const { data: welcomeTitle } = await supabase
    .from("app_settings" as "products")
    .select("value")
    .eq("key", "ask_welcome_subtitle")
    .single() as { data: { value: string } | null };
  const { data: welcomeDesc } = await supabase
    .from("app_settings" as "products")
    .select("value")
    .eq("key", "ask_welcome_description")
    .single() as { data: { value: string } | null };
  const { data: welcomeQuestions } = await supabase
    .from("app_settings" as "products")
    .select("value")
    .eq("key", "ask_example_questions")
    .single() as { data: { value: string } | null };

  let exampleQuestions: string[] | null = null;
  if (welcomeQuestions?.value) {
    try { exampleQuestions = JSON.parse(welcomeQuestions.value); } catch { /* ignore */ }
  }

  return NextResponse.json({
    ok: true,
    personas: personas.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon,
    })),
    profiles: USER_PROFILES.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
    })),
    welcome: {
      subtitle: welcomeTitle?.value || null,
      description: welcomeDesc?.value || null,
      example_questions: exampleQuestions,
    },
  });
}

interface MatchedDoc {
  id: string;
  source_type: string;
  source_id: string;
  source_url: string | null;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

// Model ID mapping
const MODEL_MAP: Record<string, { fn: "claude" | "openai" | "gemini"; model: string }> = {
  // Claude
  "claude-opus": { fn: "claude", model: "claude-opus-4-6-20250514" },
  "claude-sonnet": { fn: "claude", model: "claude-sonnet-4-6-20250514" },
  "claude-haiku": { fn: "claude", model: "claude-haiku-4-5-20251001" },
  // OpenAI
  "gpt-4o": { fn: "openai", model: "gpt-4o" },
  "gpt-4o-mini": { fn: "openai", model: "gpt-4o-mini" },
  "gpt-4.1-nano": { fn: "openai", model: "gpt-4.1-nano" },
  // Gemini
  "gemini-2.5-pro": { fn: "gemini", model: "gemini-2.5-pro" },
  "gemini-2.5-flash": { fn: "gemini", model: "gemini-2.5-flash" },
  "gemini-2.5-flash-lite": { fn: "gemini", model: "gemini-2.5-flash-lite" },
};

/**
 * Lightweight language detection for the question text.
 * Returns a human-readable label (e.g. "English", "Traditional Chinese",
 * "Japanese") that we inject into the user message so the LLM answers
 * in the same language. This is more reliable than relying on system
 * prompt rules alone — some models (notably Gemini Flash) default to
 * Chinese when the RAG context is Chinese-heavy.
 */
function detectLanguageLabel(text: string): string {
  const t = text.trim();
  if (!t) return "English";
  // Japanese: hiragana or katakana characters
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(t)) return "Japanese";
  // Korean: hangul
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(t)) return "Korean";
  // Chinese: CJK ideographs (no kana → Chinese, not Japanese)
  if (/[\u4e00-\u9fff]/.test(t)) return "Traditional Chinese (繁體中文)";
  // Default: English
  return "English";
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  product_spec: "Product Spec",
  gitbook: "Documentation / How-to",
  helpcenter: "Help Center / Tech Article",
  text_snippet: "Knowledge Snippet",
  google_doc: "Internal Doc",
  web: "Web Page",
};

/**
 * POST /api/ask
 * RAG endpoint with SSE streaming: embed question -> vector search -> stream LLM answer with sources.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as AskRequest;
  const { question, source_type, product_line, taxonomy, provider = "gemini-2.5-flash", persona: personaId = "default", profile: profileId = "default", history = [] } = body;

  // If taxonomy filter is active, we pre-filter post-RPC (pgvector containment
  // can't express the "empty product_lines = applies to all lines" inheritance
  // rule), so fetch a larger candidate pool then narrow it.
  const hasTaxonomyFilter = !!(taxonomy && (taxonomy.solution || (taxonomy.product_lines && taxonomy.product_lines.length > 0) || (taxonomy.models && taxonomy.models.length > 0)));

  // Detect model-number mentions in the question (e.g., "ECW536", "ECC500",
  // "EVS1004D"). When present, we fetch more candidates and re-rank so the
  // chunks that literally mention that model float to the top — necessary
  // because text-embedding-3-small has weaker cross-lingual performance so
  // a Chinese query may not match an English model-specific chunk tightly.
  const modelMentionRegex = /\b(E[CWS][CWS]?\d{2,4}[A-Z]?|EVS\d{2,4}[A-Z]?|ESG\d{2,4}[A-Z]?|EOC\d{2,4}[A-Z]?|EAP\d{2,4}[A-Z]?|ECP\d{2,4}[A-Z]?)\b/gi;
  const mentionedModels = [...new Set((question.match(modelMentionRegex) ?? []).map((m) => m.toUpperCase()))];
  const hasModelMention = mentionedModels.length > 0;

  // Detect country mentions (for wifi_regulation). Covers common markets in
  // English, Chinese, and ISO alpha-2 codes. Same cross-lingual embedding
  // issue as models — a Chinese query "台灣 5GHz 法規" won't reliably match
  // the English "Taiwan (TW)" chunk without a literal-match boost.
  const COUNTRY_ALIASES: Record<string, string[]> = {
    TW: ["Taiwan", "台灣", "台湾", "TW"],
    JP: ["Japan", "日本", "JP"],
    US: ["USA", "United States", "America", "美國", "美国", "US"],
    GB: ["UK", "United Kingdom", "Britain", "英國", "英国", "GB"],
    DE: ["Germany", "德國", "德国", "DE"],
    FR: ["France", "法國", "法国", "FR"],
    CN: ["China", "中國", "中国", "PRC", "CN"],
    HK: ["Hong Kong", "香港", "HK"],
    SG: ["Singapore", "新加坡", "SG"],
    MY: ["Malaysia", "馬來西亞", "马来西亚", "MY"],
    TH: ["Thailand", "泰國", "泰国", "TH"],
    ID: ["Indonesia", "印尼", "ID"],
    PH: ["Philippines", "菲律賓", "菲律宾", "PH"],
    VN: ["Vietnam", "越南", "VN"],
    KR: ["Korea", "South Korea", "韓國", "韩国", "KR"],
    IN: ["India", "印度", "IN"],
    AU: ["Australia", "澳洲", "澳大利亞", "澳大利亚", "AU"],
    CA: ["Canada", "加拿大", "CA"],
    MX: ["Mexico", "墨西哥", "MX"],
    BR: ["Brazil", "巴西", "BR"],
  };
  const mentionedCountries: string[] = [];
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    for (const alias of aliases) {
      // Use word boundary for English/ISO codes, plain substring for CJK
      const isCjk = /[\u4e00-\u9fff]/.test(alias);
      const regex = isCjk
        ? new RegExp(alias, "i")
        : new RegExp(`\\b${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
      if (regex.test(question)) {
        mentionedCountries.push(code);
        break;
      }
    }
  }
  const hasCountryMention = mentionedCountries.length > 0;

  const matchCount = hasTaxonomyFilter || hasModelMention || hasCountryMention ? 40 : 12;

  if (!question?.trim()) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(data: string) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      try {
        // Immediately signal that we're working
        sendEvent(JSON.stringify({ type: "status", status: "searching" }));

        // Step 1: Build search query
        const recentHistory = history.slice(-20);
        const searchQuery = recentHistory.length > 0
          ? `${recentHistory.map((m) => m.content).join("\n")}\n${question}`
          : question;

        const queryEmbedding = await generateEmbedding(
          searchQuery.length > 8000 ? searchQuery.slice(-8000) : searchQuery
        );

        // Step 2: Vector search in Supabase
        const supabase = createAdminClient();
        const filterMetadata = product_line ? JSON.stringify({ product_line }) : null;

        const { data: matches, error: searchError } = await supabase.rpc(
          "match_documents",
          {
            query_embedding: JSON.stringify(queryEmbedding),
            match_count: matchCount,
            match_threshold: 0.3,
            filter_source_type: source_type || null,
            filter_metadata: filterMetadata,
          }
        ) as { data: MatchedDoc[] | null; error: unknown };

        if (searchError) {
          console.error("Vector search error:", searchError);
          sendEvent(JSON.stringify({ type: "chunk", content: "Error: Search failed. " + String(searchError) }));
          sendEvent("[DONE]");
          controller.close();
          return;
        }

        let docs = matches ?? [];

        // App-level taxonomy filter — enforces solution-level inheritance rule
        // (docs with empty product_lines belong to the whole solution so they
        // should also be included when filtering by a specific product_line).
        if (hasTaxonomyFilter && taxonomy) {
          docs = docs.filter((d) => matchesTaxonomyFilter(extractTaxonomy(d.metadata), taxonomy));
        }

        // Model-mention supplementary lookup — text-embedding-3-small has weak
        // cross-lingual performance so a Chinese query like "ECW536 橘色 LED"
        // may not surface the English-language model-specific chunk. When the
        // question names one or more models explicitly, run a direct content
        // ILIKE lookup and merge those chunks into the candidate pool, then
        // re-rank so they float to the top.
        // Supplementary literal-match lookups (model + country) plus re-rank.
        // text-embedding-3-small has weak cross-lingual performance so a
        // Chinese query may not surface the right English-language chunk via
        // vector search alone. When the question names a model or a country,
        // we fetch the matching chunks directly and re-rank them to the top.
        if (hasModelMention || hasCountryMention) {
          const existingIds = new Set(docs.map((d) => d.id));
          const addUnique = (rows: Omit<MatchedDoc, "similarity">[] | null) => {
            if (!rows) return;
            for (const r of rows) {
              if (!existingIds.has(r.id)) {
                docs.push({ ...r, similarity: 0 });
                existingIds.add(r.id);
              }
            }
          };

          if (hasModelMention && mentionedModels.length > 0) {
            // Pass 1: pull ALL focused-table chunks matching this model (they
            // are high-signal and we never want them cut off by a low limit).
            for (const m of mentionedModels) {
              const { data: focused } = await supabase
                .from("documents" as "products")
                .select("id, source_type, source_id, source_url, title, content, metadata")
                .gte("chunk_index", 10000)
                .or(`content.ilike.%${m}%,title.ilike.%${m}%,source_id.ilike.%${m.toLowerCase()}%`)
                .limit(10) as { data: Omit<MatchedDoc, "similarity">[] | null };
              addUnique(focused);
            }

            // Pass 2: broader content match (product_spec + gitbook).
            const orClauses = mentionedModels
              .map((m) => `content.ilike.%${m}%,title.ilike.%${m}%,source_id.ilike.%${m.toLowerCase()}%`)
              .join(",");
            const { data: modelMatches } = await supabase
              .from("documents" as "products")
              .select("id, source_type, source_id, source_url, title, content, metadata")
              .or(orClauses)
              .limit(30) as { data: Omit<MatchedDoc, "similarity">[] | null };
            addUnique(modelMatches);
          }

          if (hasCountryMention) {
            // Country-mention supplementary lookup for wifi_regulation chunks.
            for (const code of mentionedCountries) {
              const { data: countryChunks } = await supabase
                .from("documents" as "products")
                .select("id, source_type, source_id, source_url, title, content, metadata")
                .eq("source_type", "wifi_regulation")
                .eq("source_id", code)
                .limit(3) as { data: Omit<MatchedDoc, "similarity">[] | null };
              addUnique(countryChunks);
            }
          }

          // Unified re-rank: literal model matches + focused LED bonus +
          // country literal matches + similarity.
          const scored = docs.map((d) => {
            const haystack = `${d.source_id} ${d.title} ${d.content}`.toUpperCase();
            const modelMatches = hasModelMention
              ? mentionedModels.filter((m) => haystack.includes(m)).length
              : 0;
            const isFocusedLed =
              (d.metadata?.chunk_type as string) === "focused_led_table" ? 1 : 0;
            const countryMatch =
              hasCountryMention &&
              d.source_type === "wifi_regulation" &&
              mentionedCountries.includes((d.source_id || "").toUpperCase())
                ? 1
                : 0;
            return {
              doc: d,
              score:
                modelMatches * 10 +
                isFocusedLed * 5 +
                countryMatch * 20 +
                d.similarity,
            };
          });
          scored.sort((a, b) => b.score - a.score);
          docs = scored.map((s) => s.doc);
        }

        // Trim to final context budget
        docs = docs.slice(0, 12);

        if (docs.length === 0 && recentHistory.length === 0) {
          sendEvent(JSON.stringify({ type: "chunk", content: "I couldn't find relevant product information to answer your question. Try rephrasing or asking about a specific product model." }));
          sendEvent(JSON.stringify({ type: "sources", sources: [] }));
          sendEvent(JSON.stringify({ type: "metadata", follow_ups: [], image_map: {}, provider: "none", persona: personaId, profile: profileId, match_count: 0 }));
          sendEvent("[DONE]");
          controller.close();
          return;
        }

        // Step 3: Build context from matched documents
        const context = docs.length > 0
          ? docs
              .map((d, i) => {
                const typeLabel = SOURCE_TYPE_LABELS[d.source_type] || d.source_type;
                return `[Source ${i + 1} (${typeLabel}): ${d.title}]\n${d.content}`;
              })
              .join("\n\n---\n\n")
          : "(No new documents found -- answer based on conversation history)";

        // Assemble system prompt (Persona + User Profile)
        const persona = await getPersona(personaId);
        const personaPrompt = persona?.system_prompt ?? (await getPersona("default"))!.system_prompt;
        const userProfile = USER_PROFILES.find((p) => p.id === profileId);
        const profilePrompt = userProfile?.prompt ? `\n\n---\n對話對象設定：\n${userProfile.prompt}` : "";
        // Final enforcement: language + formatting rules override any earlier
        // instructions. Appended last so LLMs that weigh recency (esp. Gemini)
        // respect these over any implicit biases in persona/profile bodies.
        const finalEnforcement = `\n\n---\n**FINAL OUTPUT CONTRACT (non-negotiable, overrides anything above):**

1. **Language match:** Detect the language of the user's LATEST message and answer in the SAME language. English in → English out. 中文進 → 中文出. 日本語入力 → 日本語で出力. Do NOT default to Chinese when the user wrote in English.

2. **Markdown structure:** Use headings (\`##\`, \`###\`), bullet lists (\`- \`), numbered lists (\`1.\`) and tables. Never pack multiple parallel points into a single dense paragraph. Leave a blank line between paragraphs.`;
        const systemPrompt = personaPrompt + profilePrompt + finalEnforcement;

        // Build conversation context for follow-up questions
        const historyText = recentHistory.length > 0
          ? `Previous conversation:\n${recentHistory.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n")}\n\n---\n\n`
          : "";

        // Build image map from matched docs
        const imageMap: Record<string, string[]> = {};
        for (const d of docs) {
          const urls = (d.metadata?.image_urls as string[]) ?? [];
          if (urls.length > 0) {
            imageMap[d.title] = urls;
          }
        }

        // Detect question language. LLMs (esp. Gemini Flash) are stubborn
        // about defaulting to Chinese when the RAG context is Chinese-heavy,
        // even with system prompt rules. Injecting a directive into the
        // user message itself has highest attention weight and works reliably.
        const answerLanguageLabel = detectLanguageLabel(question);

        const userMessage = `${historyText}Context documents:

${context}

---

Current question: ${question}

**ANSWER LANGUAGE: ${answerLanguageLabel}.** You MUST write your entire answer (including headings, lists, and follow-up questions) in ${answerLanguageLabel}. Do not default to another language.

---

IMPORTANT formatting rules:
1. Use inline citations like [1] to reference source documents. Rules: place ONE citation at the END of a paragraph or key claim (not after every sentence). Maximum 2 citations per paragraph. Never stack multiple citations together like [1, 3, 4, 5] — pick the single most relevant source.
2. After your main answer, add a line with just "---" as a separator.
3. Then list exactly 3 follow-up questions the user might want to ask next, one per line, in ${answerLanguageLabel}.`;

        // Step 4: Build sources for the response
        const sources = docs.map((d) => ({
          title: d.title,
          source_id: d.source_id,
          source_type: d.source_type,
          source_url: d.source_url,
          similarity: Math.round(d.similarity * 100) / 100,
          image_urls: (d.metadata?.image_urls as string[]) ?? [],
        }));

        // Step 5: Stream LLM response
        sendEvent(JSON.stringify({ type: "status", status: "generating" }));
        const mapped = MODEL_MAP[provider] ?? { fn: "gemini" as const, model: "gemini-2.5-flash" };

        switch (mapped.fn) {
          case "claude":
            await streamClaude(systemPrompt, userMessage, mapped.model, sendEvent);
            break;
          case "openai":
            await streamOpenAI(systemPrompt, userMessage, mapped.model, sendEvent);
            break;
          case "gemini":
          default:
            await streamGemini(systemPrompt, userMessage, mapped.model, sendEvent);
            break;
        }

        // Step 6: Send sources and metadata
        sendEvent(JSON.stringify({ type: "sources", sources }));
        sendEvent(JSON.stringify({
          type: "metadata",
          follow_ups: [],
          image_map: Object.keys(imageMap).length > 0 ? imageMap : undefined,
          provider,
          persona: personaId,
          profile: profileId,
          match_count: docs.length,
        }));
        sendEvent("[DONE]");
      } catch (err) {
        console.error("Ask SSE error:", err);
        sendEvent(JSON.stringify({ type: "chunk", content: `\n\nError: ${err instanceof Error ? err.message : String(err)}` }));
        sendEvent("[DONE]");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Stream from Claude (Anthropic) API
 */
async function streamClaude(
  systemPrompt: string,
  userMessage: string,
  model: string,
  sendEvent: (data: string) => void
): Promise<void> {
  const apiKey = await getApiKey("anthropic_api_key", API_KEY_MAP.anthropic_api_key);
  if (!apiKey) throw new Error("Anthropic API key not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      stream: true,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;
        try {
          const event = JSON.parse(jsonStr);
          if (event.type === "content_block_delta" && event.delta?.text) {
            sendEvent(JSON.stringify({ type: "chunk", content: event.delta.text }));
          }
        } catch {
          // skip unparseable lines
        }
      }
    }
  }
}

/**
 * Stream from OpenAI API
 */
async function streamOpenAI(
  systemPrompt: string,
  userMessage: string,
  model: string,
  sendEvent: (data: string) => void
): Promise<void> {
  const apiKey = await getApiKey("openai_api_key", API_KEY_MAP.openai_api_key);
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  for await (const chunk of response) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) {
      sendEvent(JSON.stringify({ type: "chunk", content: text }));
    }
  }
}

/**
 * Stream from Gemini API
 */
async function streamGemini(
  systemPrompt: string,
  userMessage: string,
  model: string,
  sendEvent: (data: string) => void
): Promise<void> {
  const apiKey = await getApiKey("google_ai_api_key", API_KEY_MAP.google_ai_api_key);
  if (!apiKey) throw new Error("Google AI API key not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr);
          // Gemini returns candidates[].content.parts[] — get text parts, skip thinking
          const parts = event.candidates?.[0]?.content?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.text !== undefined && !part.thought) {
                sendEvent(JSON.stringify({ type: "chunk", content: part.text }));
              }
            }
          }
        } catch {
          // skip unparseable lines
        }
      }
    }
  }
}
