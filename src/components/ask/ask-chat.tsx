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

interface ModelOption {
  id: string;
  label: string;
  tier: string; // "strongest" | "mainstream" | "cp-value"
}

interface ProviderGroup {
  id: string;
  label: string;
  checkKeys: string[];
  models: ModelOption[];
}

const PROVIDERS: ProviderGroup[] = [
  {
    id: "gemini",
    label: "Gemini",
    checkKeys: ["gemini-2.5-pro"],
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "Strongest" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "Mainstream" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", tier: "Best CP" },
    ],
  },
  {
    id: "openai",
    label: "GPT",
    checkKeys: ["gpt-4o"],
    models: [
      { id: "gpt-4o", label: "GPT-4o", tier: "Strongest" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", tier: "Mainstream" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", tier: "Best CP" },
    ],
  },
  {
    id: "claude",
    label: "Claude",
    checkKeys: ["claude-sonnet", "claude-opus"],
    models: [
      { id: "claude-opus", label: "Claude Opus 4.6", tier: "Strongest" },
      { id: "claude-sonnet", label: "Claude Sonnet 4.6", tier: "Mainstream" },
      { id: "claude-haiku", label: "Claude Haiku 3.5", tier: "Best CP" },
    ],
  },
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
  const [provider, setProvider] = useState("gemini-2.5-flash");
  const [persona, setPersona] = useState("default");
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [availableProviders, setAvailableProviders] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ask").then((r) => r.json()).then((d) => { if (d.ok) setPersonas(d.personas); }).catch(() => {});
    fetch("/api/settings/providers").then((r) => r.json()).then((d) => setAvailableProviders(d)).catch(() => {});
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat-sessions");
      const data = await res.json();
      if (data.ok) setSessions(data.sessions ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const saveSession = useCallback(async (msgs: Message[]) => {
    if (msgs.length === 0) return;
    const firstUserMsg = msgs.find((m) => m.role === "user");
    const title = firstUserMsg
      ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? "..." : "")
      : "New conversation";
    try {
      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId || undefined, title, persona, provider, messages: msgs }),
      });
      const data = await res.json();
      if (data.ok && data.id && !sessionId) setSessionId(data.id);
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
          question: q, provider, persona,
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
      setMessages([...newMessages, { role: "assistant" as const, content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  function handleNewChat() { setMessages([]); setSessionId(null); }

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
      await fetch("/api/chat-sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
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

  // Find current model label for display
  const currentModelLabel = PROVIDERS.flatMap((g) => g.models).find((m) => m.id === provider)?.label ?? provider;
  const currentPersonaLabel = personas.find((p) => p.id === persona);
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant" && m.provider);
  const lastUsedModel = lastAssistantMsg?.provider;

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0">
      {/* ===== Sidebar ===== */}
      <div
        className={`flex-shrink-0 overflow-hidden transition-all duration-200 ease-in-out ${
          showSidebar ? "w-60 border-r mr-4" : "w-0"
        }`}
      >
        <div className="w-60 h-full flex flex-col bg-background">
          <div className="flex items-center justify-between px-3 py-2.5 border-b">
            <span className="text-xs font-semibold text-muted-foreground">History</span>
            <div className="flex items-center gap-1">
              <button onClick={handleNewChat} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="New conversation">
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg>
              </button>
              <button onClick={() => setShowSidebar(false)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
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
                  className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors group ${sessionId === s.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{s.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground/50">{s.message_count} msgs</span>
                        <span className="text-xs text-muted-foreground/50">{formatRelativeTime(s.updated_at)}</span>
                      </div>
                    </div>
                    <button onClick={(e) => handleDeleteSession(s.id, e)} className="hidden group-hover:block flex-shrink-0 mt-0.5 text-muted-foreground/30 hover:text-red-500 transition-colors">
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 3V2a1 1 0 011-1h4a1 1 0 011 1v1M2.5 3.5h11M6 6.5v5M10 6.5v5M3.5 3.5l.5 9a1 1 0 001 1h6a1 1 0 001-1l.5-9" /></svg>
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ===== Main area ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-3 mb-3 flex-shrink-0">
          <button onClick={() => setShowSidebar(!showSidebar)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0" title="Conversation history">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
          </button>
          <div className="flex-shrink-0">
            <h1 className="text-lg font-bold tracking-tight leading-tight">Ask SpecHub</h1>
            <p className="text-xs text-muted-foreground">AI-powered product query</p>
          </div>

          {/* Persona pills */}
          <div className="flex-1 min-w-0">
            {personas.length > 0 && (
              <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5 w-fit">
                {personas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPersona(p.id)}
                    title={p.description}
                    className={`cursor-pointer rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-all ${
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
          </div>

          {messages.length > 0 && (
            <button onClick={handleNewChat} className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0 whitespace-nowrap" title="New conversation">
              + New
            </button>
          )}
        </div>

        {/* Chat card — fills remaining space */}
        <Card className="flex flex-col flex-1 min-h-0 shadow-sm overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <svg className="h-10 w-10 mx-auto text-engenius-blue/30 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <h2 className="text-base font-semibold mb-1">Ask anything about EnGenius products</h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                  Compare specs, find models, or get technical details.
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-md w-full">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button key={q} onClick={() => handleSubmit(q)}
                      className="rounded-lg border px-3 py-2 text-left text-xs text-muted-foreground hover:border-engenius-blue/40 hover:text-foreground hover:bg-muted/30 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 ${msg.role === "user" ? "bg-engenius-blue text-white" : "bg-muted"}`}>
                    {msg.role === "assistant" ? (
                      <div className="ask-markdown text-sm leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-sm leading-relaxed">{msg.content}</div>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-foreground/10">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Sources</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {[...new Map(msg.sources.map((s) => [s.source_id, s])).values()].map((s) => (
                            <Link key={s.source_id} href={s.source_url || "#"}
                              className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-xs font-medium text-engenius-blue hover:underline">
                              {s.source_id}
                              <span className="text-muted-foreground/40">{Math.round(s.similarity * 100)}%</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.provider && (
                      <div className="mt-1 text-xs text-muted-foreground/40 text-right">via {msg.provider}</div>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && <ThinkingIndicator provider={currentModelLabel} />}
          </div>

          {/* Input area */}
          <div className="border-t px-4 py-3 space-y-2 flex-shrink-0">
            {/* Model selector — provider tabs + dropdown */}
            <div className="flex items-center gap-1.5" ref={dropdownRef}>
              <span className="text-xs text-muted-foreground/50 flex-shrink-0">AI:</span>
              {PROVIDERS.map((group) => {
                const isAvailable = group.checkKeys.some((k) => availableProviders[k]);
                const activeModel = group.models.find((m) => m.id === provider);
                const isActiveGroup = !!activeModel;
                const isOpen = openDropdown === group.id;

                return (
                  <div key={group.id} className="relative">
                    <button
                      onClick={() => {
                        if (!isAvailable) return;
                        if (isOpen) {
                          setOpenDropdown(null);
                        } else {
                          setOpenDropdown(group.id);
                        }
                      }}
                      disabled={!isAvailable}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all ${
                        isActiveGroup
                          ? "bg-engenius-blue text-white shadow-sm"
                          : isAvailable
                            ? "bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
                            : "bg-muted/50 text-muted-foreground/30 cursor-not-allowed line-through"
                      }`}
                    >
                      {isActiveGroup ? activeModel.label : group.label}
                      {isAvailable && (
                        <svg className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 5l3 3 3-3" />
                        </svg>
                      )}
                    </button>

                    {/* Dropdown */}
                    {isOpen && (
                      <div className="absolute bottom-full left-0 mb-1 w-52 rounded-lg border bg-background shadow-lg py-1 z-50">
                        <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider">
                          {group.label} Models
                        </div>
                        {group.models.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => {
                              setProvider(model.id);
                              setOpenDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center justify-between ${
                              provider === model.id ? "bg-engenius-blue/5 text-engenius-blue font-medium" : ""
                            }`}
                          >
                            <span>{model.label}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              model.tier === "Strongest" ? "bg-amber-50 text-amber-700" :
                              model.tier === "Mainstream" ? "bg-blue-50 text-blue-700" :
                              "bg-emerald-50 text-emerald-700"
                            }`}>
                              {model.tier}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-end gap-2">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Ask about products, specs, or comparisons..."
                rows={1}
                className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                style={{ minHeight: 40, maxHeight: 120 }}
              />
              <Button onClick={() => handleSubmit()} disabled={loading || !input.trim()} className="h-10 px-5">
                {loading ? "..." : "Ask"}
              </Button>
            </div>
            {/* Current model info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground/40 px-1">
              <span>
                Model: {currentModelLabel}
                {currentPersonaLabel ? ` · Persona: ${currentPersonaLabel.name}` : ""}
              </span>
              {lastUsedModel && (
                <span>Last answer via {lastUsedModel}</span>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Animated thinking indicator with step progression */
function ThinkingIndicator({ provider }: { provider: string }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon: "🔍", text: "Searching product database..." },
    { icon: "📊", text: "Analyzing matched specifications..." },
    { icon: "🤖", text: `Generating answer with ${provider}...` },
  ];

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1500);
    const t2 = setTimeout(() => setStep(2), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="flex justify-start">
      <div className="bg-muted rounded-xl px-4 py-3 min-w-[280px]">
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 text-xs transition-all duration-300 ${
                i < step ? "text-muted-foreground/40" : i === step ? "text-foreground" : "text-muted-foreground/20"
              }`}
            >
              <span className={`text-sm ${i === step ? "animate-pulse" : ""}`}>
                {i < step ? "✓" : s.icon}
              </span>
              <span>{s.text}</span>
              {i === step && (
                <span className="flex gap-0.5 ml-1">
                  <span className="h-1 w-1 rounded-full bg-engenius-blue animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1 w-1 rounded-full bg-engenius-blue animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1 w-1 rounded-full bg-engenius-blue animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
