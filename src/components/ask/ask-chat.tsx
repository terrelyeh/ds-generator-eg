"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

interface PersonaOption {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

const PROVIDER_OPTIONS = [
  { id: "claude-sonnet", label: "Claude Sonnet", checkKeys: ["claude-sonnet"] },
  { id: "claude-opus", label: "Claude Opus", checkKeys: ["claude-opus"] },
  { id: "gpt-4o", label: "GPT-4o", checkKeys: ["gpt-4o"] },
  { id: "gemini-pro", label: "Gemini Pro", checkKeys: ["gemini-2.5-pro"] },
  { id: "gemini-flash", label: "Gemini Flash", checkKeys: ["gemini-2.5-pro"] },
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
  const [provider, setProvider] = useState("gemini-flash");
  const [persona, setPersona] = useState("default");
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [availableProviders, setAvailableProviders] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load personas and available providers
  useEffect(() => {
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
  }, [messages, loading]);

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
        body: JSON.stringify({
          question: q,
          provider,
          persona,
          history: messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
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
          { role: "assistant", content: `Error: ${data.error}${data.details ? `\n\n${data.details}` : ""}` },
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleClear() {
    setMessages([]);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      {/* Compact header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Ask SpecHub</h1>
          <p className="text-xs text-muted-foreground">
            AI-powered product query — ask in English or Chinese
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Persona selector */}
          {personas.length > 0 && (
            <div className="flex gap-1 rounded-lg bg-muted p-0.5">
              {personas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPersona(p.id)}
                  title={p.description}
                  className={`cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-all ${
                    persona === p.id
                      ? "bg-engenius-blue text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background"
                  }`}
                >
                  {p.icon && <span className="mr-0.5">{p.icon}</span>}
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Clear conversation"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Chat area — takes all remaining space */}
      <Card className="flex flex-col flex-1 shadow-sm overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-5xl mb-5 opacity-80">
                <svg className="h-12 w-12 mx-auto text-engenius-blue/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-1.5">Ask anything about EnGenius products</h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-md">
                Compare specs, find models with specific features, or get technical details.
              </p>

              {/* Example questions */}
              <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSubmit(q)}
                    className="rounded-lg border px-3 py-2.5 text-left text-xs text-muted-foreground hover:border-engenius-blue/40 hover:text-foreground hover:bg-muted/30 transition-all"
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
                  {msg.role === "assistant" ? (
                    <div className="ask-markdown text-sm leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed">{msg.content}</div>
                  )}

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

          {/* Loading animation */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-xl px-4 py-3">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-engenius-blue/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-engenius-blue/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-engenius-blue/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs">Searching specs & generating answer...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t px-4 py-3 space-y-2">
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
