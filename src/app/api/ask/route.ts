import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/rag/embeddings";
import { getApiKey, API_KEY_MAP } from "@/lib/settings";
import { getPersona, listPersonas } from "@/lib/rag/personas";

// Allow up to 30s for RAG queries
export const maxDuration = 30;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AskRequest {
  question: string;
  source_type?: string; // Filter by source type
  product_line?: string; // Filter by product line
  provider?: string; // LLM provider: 'claude' | 'openai' | 'gemini'
  persona?: string;  // Persona slug: 'default' | 'sales' | 'support' | 'pm' | custom
  history?: ChatMessage[]; // Previous messages for conversation context
}

/**
 * GET /api/ask
 * Returns list of available personas.
 */
export async function GET() {
  const personas = await listPersonas();
  return NextResponse.json({
    ok: true,
    personas: personas.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon,
    })),
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

/**
 * POST /api/ask
 * RAG endpoint: embed question → vector search → LLM answer with sources.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as AskRequest;
  const { question, source_type, product_line, provider = "gemini", persona: personaId = "default", history = [] } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  try {
    // Step 1: Build search query — for follow-up questions, include context from history
    // so the embedding captures the full intent (e.g., "這幾台" → models from previous answer)
    const recentHistory = history.slice(-20); // last 10 exchanges
    const searchQuery = recentHistory.length > 0
      ? `${recentHistory.map((m) => m.content).join("\n")}\n${question}`
      : question;

    // Embed using enriched query for better search results
    const queryEmbedding = await generateEmbedding(
      searchQuery.length > 8000 ? searchQuery.slice(-8000) : searchQuery
    );

    // Step 2: Vector search in Supabase
    const supabase = createAdminClient();

    const filterMetadata = product_line
      ? JSON.stringify({ product_line })
      : null;

    const { data: matches, error: searchError } = await supabase.rpc(
      "match_documents",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: 8,
        match_threshold: 0.3,
        filter_source_type: source_type || null,
        filter_metadata: filterMetadata,
      }
    ) as { data: MatchedDoc[] | null; error: unknown };

    if (searchError) {
      console.error("Vector search error:", searchError);
      return NextResponse.json(
        { error: "Search failed", details: String(searchError) },
        { status: 500 }
      );
    }

    const docs = matches ?? [];

    if (docs.length === 0 && recentHistory.length === 0) {
      return NextResponse.json({
        ok: true,
        answer: "I couldn't find relevant product information to answer your question. Try rephrasing or asking about a specific product model.",
        sources: [],
        provider: "none",
      });
    }

    // Step 3: Build context from matched documents
    const context = docs.length > 0
      ? docs
          .map((d, i) => `[Source ${i + 1}: ${d.title}]\n${d.content}`)
          .join("\n\n---\n\n")
      : "(No new documents found — answer based on conversation history)";

    // Step 3.5: Load persona system prompt
    const persona = await getPersona(personaId);
    const systemPrompt = persona?.system_prompt ?? (await getPersona("default"))!.system_prompt;

    // Build conversation context for follow-up questions
    const historyText = recentHistory.length > 0
      ? `Previous conversation:\n${recentHistory.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n")}\n\n---\n\n`
      : "";

    const userMessage = `${historyText}Context documents:

${context}

---

Current question: ${question}`;

    // Step 4: Call LLM
    const answer = await callLLM(provider, systemPrompt, userMessage);

    // Step 5: Return answer with sources
    const sources = docs.map((d) => ({
      title: d.title,
      source_id: d.source_id,
      source_type: d.source_type,
      source_url: d.source_url,
      similarity: Math.round(d.similarity * 100) / 100,
    }));

    return NextResponse.json({
      ok: true,
      answer,
      sources,
      persona: personaId,
      provider,
      match_count: docs.length,
    });
  } catch (err) {
    console.error("Ask error:", err);
    return NextResponse.json(
      {
        error: "Failed to process question",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * Call LLM with the given system prompt and user message.
 * Supports: claude (default), openai, gemini
 */
async function callLLM(
  provider: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  switch (provider) {
    case "openai":
    case "gpt-4o":
      return callOpenAI(systemPrompt, userMessage);
    case "gemini":
      return callGemini(systemPrompt, userMessage);
    case "claude":
    default:
      return callClaude(systemPrompt, userMessage);
  }
}

async function callClaude(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
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
      model: "claude-sonnet-4-5-20241219",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Claude API error: ${data.error?.message || JSON.stringify(data)}`);
  }
  return data.content?.[0]?.text ?? "";
}

async function callOpenAI(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const apiKey = await getApiKey("openai_api_key", API_KEY_MAP.openai_api_key);
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 2048,
  });

  return response.choices[0]?.message?.content ?? "";
}

async function callGemini(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const apiKey = await getApiKey("google_ai_api_key", API_KEY_MAP.google_ai_api_key);
  if (!apiKey) throw new Error("Google AI API key not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini API error: ${JSON.stringify(data)}`);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
