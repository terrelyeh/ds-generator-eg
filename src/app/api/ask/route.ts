import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApiKey, API_KEY_MAP } from "@/lib/settings";
import { getPersona, listPersonas, USER_PROFILES } from "@/lib/rag/personas";
import { type TaxonomyMeta } from "@/lib/rag/taxonomy";
import { retrieveDocuments } from "@/lib/rag/retrieve";
import { gate } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { DEMO_COOKIE, isValidDemoToken } from "@/lib/auth/demo-session";
import { loadWorkspaceBySlug, publicWorkspace } from "@/lib/ask/workspaces";
import { workspaceCookieName, isValidWorkspaceToken } from "@/lib/auth/workspace-session";
import { decryptKey } from "@/lib/auth/api-key";

// Allow up to 60s for RAG queries (embedding + vector search + LLM)
export const maxDuration = 60;

/**
 * Ask is reachable two ways: a logged-in user with the `ask.use` permission,
 * OR a passcode demo session (EnGenie public entry). Returns a denial
 * NextResponse, or null if allowed.
 */
async function gateAskOrDemo(): Promise<NextResponse | null> {
  const c = await cookies();
  if (await isValidDemoToken(c.get(DEMO_COOKIE)?.value)) return null;
  return gate("ask.use");
}

// Diagram-intent detection — only then do we inject the (token-heavy) topology
// instructions + device catalog, so normal asks stay cheap.
const TOPOLOGY_RE = /拓[樸撲]|topolog|架構圖|網路圖|網路架構|網路拓|部署圖|deployment\s*(diagram|map)|application\s*diagram|network\s*(diagram|map)|draw.*(network|topology|diagram)|畫.*(圖|拓|架構|網路)/i;

/** If the question asks for a diagram, return prompt text teaching the LLM to
 *  emit a ```topology block using only models that have an icon. Else "". */
async function buildTopologyHint(
  supabase: ReturnType<typeof createAdminClient>,
  question: string,
): Promise<string> {
  if (!TOPOLOGY_RE.test(question)) return "";

  const { data } = (await supabase
    .from("topology_icons" as "products")
    .select("key, role")) as { data: { key: string; role: string | null }[] | null };
  if (!data?.length) return "";
  const seen = new Set<string>();
  const byRole: Record<string, string[]> = {};
  for (const r of data) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    (byRole[r.role ?? "device"] ||= []).push(r.key);
  }
  const catalog = Object.entries(byRole)
    .map(([role, keys]) => `  ${role}: ${keys.sort().join(", ")}`)
    .join("\n");
  return `

---

DIAGRAM MODE: If a network / application topology would help, output a fenced \`topology\` block with JSON of this shape:
\`\`\`topology
{"title":"…","nodes":[{"id":"n1","model":"ESG620","role":"gateway","label":"防火牆"}],"links":[{"from":"n1","to":"n2","speed":"10G"}],"zones":[{"label":"客房區","nodes":["n3","n4"]}]}
\`\`\`
Rules:
- Product nodes MUST use one of these exact model keys (pick what genuinely fits):
${catalog}
- Generic nodes (no model): role ∈ internet, modem, server, client.
- links: add "speed" when known — one of "1G","2.5G","5G","10G","SFP","WiFi" (it colours the line). Keep links logical (each device connects to its real uplink).
- zones (optional): group nodes by area/floor, e.g. {"label":"客房區","nodes":["n3","n4"]}.
- label = SHORT purpose only (the model number is shown separately), e.g. 「核心交換器」「大廳 AP」, ≤ 8 chars.
- Keep ≤ ~14 nodes. The topology block MUST be ONE line of strictly valid minified JSON: ASCII straight double-quotes only ("), ASCII commas/colons only (never full-width ，：「」), no comments, no trailing commas. The renderer parses it directly to draw an icon diagram.

Then, DIRECTLY BELOW the topology block, ALSO draw a richer ASCII box diagram inside a plain \`\`\`text fence — it renders stacked under the icon diagram as a detailed reference:
\`\`\`text
        ┌────────────────────────┐
        │ ESG620                 │
        │ Cloud VPN Firewall     │
        │ 防火牆 / NAT / VPN / VLAN │
        └───────────┬────────────┘
                    │ LAN / Trunk
        ┌───────────┴────────────┐
        │ ECS1528P               │
        │ Cloud L2+ PoE Switch   │
        │ 24 x GbE PoE+ / 4x 10G │
        └───────────┬────────────┘
             ┌───────┴───────┐
        ┌────┴─────┐    ┌────┴─────┐
        │ ECW230   │    │ ECW230   │
        │ 辦公室 AP │    │ 產線 AP  │
        └────┬─────┘    └────┬─────┘
        辦公筆電/手機     工業平板/掃碼槍
\`\`\`
ASCII rules: use box-drawing chars (┌┐└┘│─┬┴├┤); each box = 型號 + 產品類別 + 關鍵規格; label EVERY link with its purpose/speed (WAN, LAN / Trunk, WiFi, 1G/10G); show end devices at the leaves; align columns with spaces (monospace). Put the final "---" AFTER both blocks.`;
}

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
  /** Workspace slug — when set, runs in per-department workspace mode (/ask/<slug>). */
  workspace?: string;
  /** User-supplied LLM key for a `user_byok` workspace. Never stored/logged. */
  userKey?: string;
}

/**
 * GET /api/ask
 * Returns list of available personas.
 */
export async function GET(request: Request) {
  // Workspace mode: ?workspace=<slug> — gate by the workspace cookie and return
  // that workspace's welcome/defaults. Otherwise the standard demo/RBAC gate.
  const slug = new URL(request.url).searchParams.get("workspace");
  const ws = slug ? await loadWorkspaceBySlug(slug) : null;
  if (slug) {
    if (!ws || !ws.enabled) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    const c = await cookies();
    const ok = await isValidWorkspaceToken(ws.slug, c.get(workspaceCookieName(ws.slug))?.value);
    if (!ok) return NextResponse.json({ ok: false, error: "Workspace passcode required" }, { status: 401 });
  } else {
    const denied = await gateAskOrDemo();
    if (denied) return denied;
  }

  const personas = await listPersonas();

  let welcome: { subtitle: string | null; description: string | null; example_questions: string[] | null };
  if (ws) {
    welcome = {
      subtitle: ws.welcome_subtitle,
      description: ws.welcome_description,
      example_questions: Array.isArray(ws.example_questions) ? ws.example_questions : null,
    };
  } else {
    const supabase = createAdminClient();
    const get = async (key: string) =>
      ((await supabase.from("app_settings" as "products").select("value").eq("key", key).single()) as { data: { value: string } | null }).data?.value || null;
    const [subtitle, description, questionsRaw] = await Promise.all([
      get("ask_welcome_subtitle"),
      get("ask_welcome_description"),
      get("ask_example_questions"),
    ]);
    let exampleQuestions: string[] | null = null;
    if (questionsRaw) { try { exampleQuestions = JSON.parse(questionsRaw); } catch { /* ignore */ } }
    welcome = { subtitle, description, example_questions: exampleQuestions };
  }

  return NextResponse.json({
    ok: true,
    personas: personas.map((p) => ({ id: p.id, name: p.name, description: p.description, icon: p.icon })),
    profiles: USER_PROFILES.map((p) => ({ id: p.id, label: p.label, description: p.description })),
    welcome,
    workspace: ws ? publicWorkspace(ws) : null,
  });
}

// Model ID mapping
const MODEL_MAP: Record<string, { fn: "claude" | "openai" | "gemini"; model: string }> = {
  // Claude (dateless IDs are pinned snapshots from the 4.6 generation on)
  "claude-opus": { fn: "claude", model: "claude-opus-4-8" },
  "claude-sonnet": { fn: "claude", model: "claude-sonnet-4-6" },
  "claude-haiku": { fn: "claude", model: "claude-haiku-4-5-20251001" },
  // OpenAI
  "gpt-5.5": { fn: "openai", model: "gpt-5.5" },
  "gpt-5.4-mini": { fn: "openai", model: "gpt-5.4-mini" },
  "gpt-5.4-nano": { fn: "openai", model: "gpt-5.4-nano" },
  // Gemini (3.x — 3.5 Flash is GA frontier; 3.1 Pro is still preview-only)
  "gemini-3.1-pro": { fn: "gemini", model: "gemini-3.1-pro-preview" },
  "gemini-3.5-flash": { fn: "gemini", model: "gemini-3.5-flash" },
  "gemini-3.1-flash-lite": { fn: "gemini", model: "gemini-3.1-flash-lite" },
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
  const { question, source_type, product_line, taxonomy, history = [] } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  // ── Auth + per-request config: workspace mode (/ask/<slug>) vs standard ──
  const ws = body.workspace ? await loadWorkspaceBySlug(body.workspace) : null;
  if (body.workspace) {
    if (!ws || !ws.enabled) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const c = await cookies();
    const ok = await isValidWorkspaceToken(ws.slug, c.get(workspaceCookieName(ws.slug))?.value);
    if (!ok) return NextResponse.json({ error: "Workspace passcode required" }, { status: 401 });
    // Per-minute / daily quota (atomic; protects shared key, harmless for BYOK).
    const { data: touch } = (await createAdminClient().rpc("ask_workspace_touch", { p_slug: ws.slug })) as {
      data: { allowed: boolean; reason: string | null }[] | null;
    };
    const t = touch?.[0];
    if (t && !t.allowed) {
      const msg =
        t.reason === "daily_limit" ? "Daily limit reached for this workspace."
        : t.reason === "rate_limit" ? "Too many requests — try again shortly."
        : "This workspace is disabled.";
      return NextResponse.json({ error: msg }, { status: 429 });
    }
  } else {
    const denied = await gateAskOrDemo();
    if (denied) return denied;
  }

  // Effective persona / profile / provider — a workspace can fix these when
  // allow_switch=false; otherwise the request (or workspace default) wins.
  const personaId = ws && !ws.allow_switch ? ws.persona : (body.persona ?? ws?.persona ?? "default");
  const profileId = ws && !ws.allow_switch ? ws.profile : (body.profile ?? ws?.profile ?? "default");
  const provider = ws && !ws.allow_switch ? ws.provider : (body.provider ?? ws?.provider ?? "gemini-3.5-flash");

  // BYOK generation key. Two flavours:
  //   byok      — the workspace carries ONE admin-set key (shared by all users).
  //   user_byok — each visitor supplies their OWN key per request (body.userKey);
  //               we never store or log it, just forward it to the provider.
  let llmKeyOverride: string | undefined;
  if (ws && ws.llm_mode === "byok") {
    const k = decryptKey(ws.byok_key_encrypted);
    if (!k) return NextResponse.json({ error: "Workspace BYOK key not set or unreadable" }, { status: 400 });
    llmKeyOverride = k;
  } else if (ws && ws.llm_mode === "user_byok") {
    const uk = body.userKey?.trim();
    if (!uk) {
      return NextResponse.json(
        { error: "This workspace needs your own API key. Add it to start chatting.", code: "user_key_required" },
        { status: 400 },
      );
    }
    llmKeyOverride = uk;
  }
  // Retrieval (embed → vector search → taxonomy filter → cross-lingual
  // supplements → re-rank → trim) lives in the shared lib/rag/retrieve.ts so
  // the chat and the Search API stay in lockstep.

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

        // Step 1+2: Retrieve scoped, ranked chunks via the shared core.
        const recentHistory = history.slice(-20);
        const supabase = createAdminClient();

        let docs;
        try {
          docs = await retrieveDocuments(
            ws
              ? {
                  question,
                  history,
                  finalLimit: 12,
                  strictScope: true,
                  taxonomy: {
                    solution: ws.scope?.solution ?? null,
                    product_lines: ws.scope?.product_lines ?? [],
                    models: ws.scope?.models ?? [],
                  },
                  sourceTypes: ws.scope?.source_types ?? null,
                }
              : { question, history, sourceType: source_type, productLine: product_line, taxonomy, finalLimit: 12 },
          );
        } catch (searchError) {
          console.error("Vector search error:", searchError);
          sendEvent(JSON.stringify({ type: "chunk", content: "Error: Search failed. " + String(searchError) }));
          sendEvent("[DONE]");
          controller.close();
          return;
        }

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

2. **Lead with the answer:** Open with 1–2 sentences that directly answer the question, before any background. No throat-clearing like "Based on the documents…".

3. **Markdown structure (write like ChatGPT / Claude — scannable, not a wall of text):**
   - Use \`##\` / \`###\` headings to split a multi-part answer into sections.
   - Use \`- \` bullet lists for parallel points; \`1.\` numbered lists for steps or sequences.
   - Use a Markdown **table** whenever you compare 2 or more products, models, or options (one row per item, columns for the compared attributes).
   - **Bold** key terms, model numbers and spec values (e.g. **ECW536**, **WiFi 7**, **2.5 GbE**).
   - Keep paragraphs short (2–4 sentences) with a blank line between them. Never pack multiple parallel points into one dense paragraph.
   - Use a fenced code block only for real commands / config / CLI snippets — not for plain prose.`;
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

        const topoHint = await buildTopologyHint(supabase, question);

        const userMessage = `${historyText}Context documents:

${context}

---

Current question: ${question}${topoHint}

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
        const mapped = MODEL_MAP[provider] ?? { fn: "gemini" as const, model: "gemini-3.5-flash" };

        switch (mapped.fn) {
          case "claude":
            await streamClaude(systemPrompt, userMessage, mapped.model, sendEvent, llmKeyOverride);
            break;
          case "openai":
            await streamOpenAI(systemPrompt, userMessage, mapped.model, sendEvent, llmKeyOverride);
            break;
          case "gemini":
          default:
            await streamGemini(systemPrompt, userMessage, mapped.model, sendEvent, llmKeyOverride);
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
  sendEvent: (data: string) => void,
  apiKeyOverride?: string
): Promise<void> {
  const apiKey = apiKeyOverride || await getApiKey("anthropic_api_key", API_KEY_MAP.anthropic_api_key);
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
  sendEvent: (data: string) => void,
  apiKeyOverride?: string
): Promise<void> {
  const apiKey = apiKeyOverride || await getApiKey("openai_api_key", API_KEY_MAP.openai_api_key);
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
  sendEvent: (data: string) => void,
  apiKeyOverride?: string
): Promise<void> {
  const apiKey = apiKeyOverride || await getApiKey("google_ai_api_key", API_KEY_MAP.google_ai_api_key);
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
