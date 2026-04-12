"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

interface SessionSummary {
  id: string;
  title: string;
  persona: string;
  message_count: number;
  updated_at: string;
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

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load personas and providers
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

  // Load session list
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat-sessions");
      const data = await res.json();
      if (data.ok) setSessions(data.sessions ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Auto-save session (debounced)
  const saveSession = useCallback(async (msgs: Message[]) => {
    if (msgs.length === 0) return;

    // Generate title from first user message
    const firstUserMsg = msgs.find((m) => m.role === "user");
    const title = firstUserMsg
      ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? "..." : "")
      : "New conversation";

    try {
      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sessionId || undefined,
          title,
          persona,
          provider,
          messages: msgs,
        }),
      });
      const data = await res.json();
      if (data.ok && data.id && !sessionId) {
        setSessionId(data.id);
      }
      fetchSessions();
    } catch { /* ignore */ }
  }, [sessionId, persona, provider, fetchSessions]);

  function scheduleSave(msgs: Message[]) {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveSession(msgs), 1000);
  }

  async function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    setInput("");
    const newMessages = [...messages, { role: "user" as const, content: q }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          provider,
          persona,
          history: newMessages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();

      const updatedMessages = data.ok
        ? [...newMessages, { role: "assistant" as const, content: data.answer, sources: data.sources, provider: data.provider }]
        : [...newMessages, { role: "assistant" as const, content: `Error: ${data.error}${data.details ? `\n\n${data.details}` : ""}` }];

      setMessages(updatedMessages);
      scheduleSave(updatedMessages);
    } catch (err) {
      const errMessages = [...newMessages, {
        role: "assistant" as const,
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }];
      setMessages(errMessages);
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

  function handleNewChat() {
    setMessages([]);
    setSessionId(null);
  }

  async function handleLoadSession(id: string) {
    try {
      const res = await fetch(`/api/chat-sessions?id=${id}`);
      const data = await res.json();
      if (data.ok && data.session) {
        setMessages(data.session.messages ?? []);
        setSessionId(id);
        setPersona(data.session.persona || "default");
        setProvider(data.session.provider || "gemini-flash");
        setShowSidebar(false);
      }
    } catch { /* ignore */ }
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    try {
      await fetch("/api/chat-sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (sessionId === id) handleNewChat();
      fetchSessions();
    } catch { /* ignore */ }
  }

  function formatRelativeTime(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 120px)" }}>
      {/* Session sidebar */}
      {showSidebar && (
        <div className="w-64 flex-shrink-0 flex flex-col rounded-xl border bg-background shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b">
            <span className="text-xs font-semibold text-muted-foreground">History</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewChat}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="New conversation"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
              <button
                onClick={() => setShowSidebar(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground/50">No conversations yet</div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleLoadSession(s.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors group ${
                    sessionId === s.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{s.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground/50">{s.message_count} msgs</span>
                        <span className="text-[10px] text-muted-foreground/50">{formatRelativeTime(s.updated_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="hidden group-hover:block flex-shrink-0 mt-0.5 text-muted-foreground/30 hover:text-red-500 transition-colors"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M5 3V2a1 1 0 011-1h4a1 1 0 011 1v1M2.5 3.5h11M6 6.5v5M10 6.5v5M3.5 3.5l.5 9a1 1 0 001 1h6a1 1 0 001-1l.5-9" />
                      </svg>
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Conversation history"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Ask SpecHub</h1>
              <p className="text-xs text-muted-foreground">
                AI-powered product query — ask in English or Chinese
              </p>
            </div>
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
                onClick={handleNewChat}
                className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="New conversation"
              >
                + New
              </button>
            )}
          </div>
        </div>

        {/* Chat card */}
        <Card className="flex flex-col flex-1 shadow-sm overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <svg className="h-12 w-12 mx-auto text-engenius-blue/40 mb-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <h2 className="text-lg font-semibold mb-1.5">Ask anything about EnGenius products</h2>
                <p className="text-sm text-muted-foreground mb-8 max-w-md">
                  Compare specs, find models with specific features, or get technical details.
                </p>
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
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    msg.role === "user" ? "bg-engenius-blue text-white" : "bg-muted"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="ask-markdown text-sm leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-sm leading-relaxed">{msg.content}</div>
                    )}

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-foreground/10">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Sources</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {[...new Map(msg.sources.map((s) => [s.source_id, s])).values()].map((s) => (
                            <Link key={s.source_id} href={s.source_url || "#"}
                              className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-[11px] font-medium text-engenius-blue hover:underline">
                              {s.source_id}
                              <span className="text-muted-foreground/40">{Math.round(s.similarity * 100)}%</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.provider && (
                      <div className="mt-1 text-[10px] text-muted-foreground/40 text-right">via {msg.provider}</div>
                    )}
                  </div>
                </div>
              ))
            )}

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
              <Button onClick={() => handleSubmit()} disabled={loading || !input.trim()} className="h-11 px-6">
                {loading ? "..." : "Ask"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
