"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Source {
  title: string;
  source_id: string;
  source_type: string;
  source_url: string | null;
  similarity: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  provider?: string;
}

interface IndexStats {
  product_spec?: { count: number; sources: number; last_updated: string | null };
}

interface PersonaOption {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

const PROVIDER_OPTIONS = [
  { id: "claude", label: "Claude", checkKeys: ["claude-sonnet", "claude-opus"] },
  { id: "openai", label: "GPT-4o", checkKeys: ["gpt-4o"] },
  { id: "gemini", label: "Gemini", checkKeys: ["gemini-2.5-pro"] },
];

const EXAMPLE_QUESTIONS = [
  "哪些 AP 支援 WiFi 7？",
  "ECC100 和 ECC500 差在哪裡？",
  "Which switches support PoE++?",
  "推薦一台適合戶外的攝影機",
  "ESG510 的 VPN throughput 是多少？",
  "List all cameras with built-in storage",
];

export function AskChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("gemini");
  const [persona, setPersona] = useState("default");
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [availableProviders, setAvailableProviders] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [indexing, setIndexing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load index stats, personas, and available providers
  useEffect(() => {
    fetch("/api/documents?source_type=product_spec")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setStats(d.stats); })
      .catch(() => {});
    fetch("/api/ask")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setPersonas(d.personas); })
      .catch(() => {});
    fetch("/api/settings/providers")
      .then((r) => r.json())
      .then((d) => setAvailableProviders(d))
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, provider, persona }),
      });
      const data = await res.json();

      if (data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            provider: data.provider,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleIndex() {
    setIndexing(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ingest", source_type: "product_spec" }),
      });
      const data = await res.json();
      if (data.ok) {
        const msg = `Indexed ${data.processed} chunks (${data.skipped} unchanged).${data.errors?.length ? ` Errors: ${data.errors.length}` : ""}`;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: msg },
        ]);
        // Refresh stats
        const statsRes = await fetch("/api/documents?source_type=product_spec");
        const statsData = await statsRes.json();
        if (statsData.ok) setStats(statsData.stats);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Index failed: ${data.error}` },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Index failed: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setIndexing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const isEmpty = messages.length === 0;
  const specStats = stats?.product_spec;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ask SpecHub</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask questions about EnGenius products and specifications. Powered by AI + vector search.
        </p>
      </div>

      {/* Index status bar */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-3 text-sm">
          {specStats ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium">{specStats.sources} products</span>
                <span className="text-muted-foreground">indexed ({specStats.count} chunks)</span>
              </span>
              {specStats.last_updated && (
                <span className="text-xs text-muted-foreground">
                  Last: {new Date(specStats.last_updated).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">No products indexed yet</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleIndex}
          disabled={indexing}
          className="text-xs"
        >
          {indexing ? "Indexing..." : specStats ? "Re-index" : "Index Products"}
        </Button>
      </div>

      {/* Persona selector */}
      {personas.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Persona:</span>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => setPersona(p.id)}
                title={p.description}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                  persona === p.id
                    ? "bg-engenius-blue text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background"
                }`}
              >
                {p.icon && <span className="mr-1">{p.icon}</span>}
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat area */}
      <Card className="flex flex-col shadow-sm" style={{ height: "calc(100vh - 390px)", minHeight: 400 }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-4xl mb-4">🔍</div>
              <h2 className="text-lg font-semibold mb-2">Ask anything about EnGenius products</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                I can compare specs, find models with specific features, or explain technical details.
              </p>

              {/* Example questions */}
              <div className="grid grid-cols-2 gap-2 max-w-lg">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSubmit(q)}
                    className="rounded-lg border px-3 py-2 text-left text-xs text-muted-foreground hover:border-engenius-blue/40 hover:text-foreground transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-engenius-blue text-white"
                      : "bg-muted"
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-foreground/10">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Sources
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {[...new Map(msg.sources.map((s) => [s.source_id, s])).values()].map((s) => (
                          <Link
                            key={s.source_id}
                            href={s.source_url || "#"}
                            className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-[11px] font-medium text-engenius-blue hover:underline"
                          >
                            {s.source_id}
                            <span className="text-muted-foreground/40">{Math.round(s.similarity * 100)}%</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.provider && (
                    <div className="mt-1 text-[10px] text-muted-foreground/40 text-right">
                      via {msg.provider}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t p-4 space-y-2.5">
          {/* Provider selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/60">AI:</span>
            <div className="flex gap-1">
              {PROVIDER_OPTIONS.map((p) => {
                const isAvailable = p.checkKeys.some((k) => availableProviders[k]);
                return (
                  <button
                    key={p.id}
                    onClick={() => isAvailable && setProvider(p.id)}
                    disabled={!isAvailable}
                    title={isAvailable ? p.label : `${p.label} — API key not configured`}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                      provider === p.id
                        ? "bg-engenius-blue text-white shadow-sm"
                        : isAvailable
                          ? "bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
                          : "bg-muted/50 text-muted-foreground/30 cursor-not-allowed line-through"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about products, specs, or comparisons..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
              style={{ minHeight: 44, maxHeight: 120 }}
            />
            <Button
              onClick={() => handleSubmit()}
              disabled={loading || !input.trim()}
              className="h-11 px-6"
            >
              {loading ? "..." : "Ask"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
