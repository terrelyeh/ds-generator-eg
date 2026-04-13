import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/rag/embeddings";
import { getApiKey, API_KEY_MAP } from "@/lib/settings";
import { getPersona, listPersonas, USER_PROFILES } from "@/lib/rag/personas";

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
  const { question, source_type, product_line, provider = "gemini-2.5-flash", persona: personaId = "default", profile: profileId = "default", history = [] } = body;

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
            match_count: 12,
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

        const docs = matches ?? [];

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
        const systemPrompt = personaPrompt + profilePrompt;

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

        const userMessage = `${historyText}Context documents:

${context}

---

Current question: ${question}

---

IMPORTANT formatting rules:
1. Use inline citations like [1] to reference source documents. Rules: place ONE citation at the END of a paragraph or key claim (not after every sentence). Maximum 2 citations per paragraph. Never stack multiple citations together like [1, 3, 4, 5] — pick the single most relevant source.
2. After your main answer, add a line with just "---" as a separator.
3. Then list exactly 3 follow-up questions the user might want to ask next, one per line, in the same language as the question.`;

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
