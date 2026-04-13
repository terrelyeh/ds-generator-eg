"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Source {
  title: string;
  source_id: string;
  source_type: string;
  source_url: string | null;
  similarity: number;
  image_urls?: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  provider?: string;
  followUps?: string[];
  imageMap?: Record<string, string[]>;
  isStreaming?: boolean;
}

interface PersonaOption {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

interface ProfileOption {
  id: string;
  label: string;
  description: string;
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
  tier: string;
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
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "Best CP" },
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
  "怎麼設定 Site-to-Site VPN？",
  "ECC100 和 ECC500 差在哪裡？",
  "PRO license 到期後設備還能用嗎？",
  "推薦適合飯店的網路方案",
  "怎麼設定 Captive Portal？",
  "Cloud AP 和 Fit AP 有什麼差別？",
  "AirGuard 怎麼偵測 Rogue AP？",
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** EnGenius AI assistant icon — clean, minimal with breathing animation */
function AssistantIcon({ size = 56, animate = true }: { size?: number; animate?: boolean }) {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${animate ? "animate-[breathe_3s_ease-in-out_infinite]" : ""}`}
      style={{ width: size * 1.5, height: size * 1.5 }}
    >
      {/* Outer glow ring */}
      <div className={`absolute inset-0 rounded-full bg-engenius-blue/6 ${animate ? "animate-[pulse_3s_ease-in-out_infinite]" : ""}`} />
      <div className="absolute inset-2 rounded-full bg-engenius-blue/4" />
      <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
        {/* Simple sparkle / AI star */}
        <path
          d="M28 8 L31 22 L45 25 L31 28 L28 42 L25 28 L11 25 L25 22 Z"
          fill="#03a9f4"
          opacity="0.85"
        />
        {/* Inner glow dot */}
        <circle cx="28" cy="25" r="3" fill="white" opacity="0.9" />
        {/* Small accent sparkle */}
        <path d="M40 12 L41.2 15.8 L45 17 L41.2 18.2 L40 22 L38.8 18.2 L35 17 L38.8 15.8 Z" fill="#03a9f4" opacity="0.4" />
        <path d="M14 36 L15 38.5 L17.5 39.5 L15 40.5 L14 43 L13 40.5 L10.5 39.5 L13 38.5 Z" fill="#03a9f4" opacity="0.3" />
      </svg>
    </div>
  );
}

/* ─── Citation tooltip ─── */
const SOURCE_TYPE_LABEL: Record<string, string> = {
  product_spec: "Product Spec",
  gitbook: "Documentation",
  helpcenter: "Help Center",
  text_snippet: "Snippet",
  google_doc: "Internal Doc",
  web: "Web",
};

function CitationTooltip({ index, sources }: { index: number; sources: Source[] }) {
  const [show, setShow] = useState(false);
  const src = sources[index - 1];
  if (!src) return <sup className="text-engenius-blue/70 font-medium cursor-default text-[10px]">[{index}]</sup>;

  const images = src.image_urls ?? [];

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <sup className="text-engenius-blue/70 font-medium cursor-pointer hover:text-engenius-blue text-[10px]">
        [{index}]
      </sup>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 rounded-xl border bg-white shadow-xl text-xs pointer-events-auto"
          style={{ width: images.length > 0 ? 280 : 220 }}>
          <span className="block px-3 pt-2.5 pb-2">
            <span className="font-semibold text-foreground block truncate leading-tight">{src.title}</span>
            <span className="flex items-center gap-1.5 mt-0.5">
              <span className="text-muted-foreground">{SOURCE_TYPE_LABEL[src.source_type] ?? src.source_type}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/50">{Math.round(src.similarity * 100)}%</span>
            </span>
          </span>
          {images.length > 0 && (
            <span className="block border-t px-2 py-2">
              <span className="flex gap-1.5 overflow-x-auto">
                {images.slice(0, 3).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="block flex-shrink-0 rounded-md border overflow-hidden hover:ring-1 hover:ring-engenius-blue/40 transition-all">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Ref ${index}-${i + 1}`} loading="lazy"
                      className="h-16 w-auto object-contain bg-white" />
                  </a>
                ))}
                {images.length > 3 && (
                  <span className="flex-shrink-0 flex items-center justify-center h-16 w-10 rounded-md bg-muted text-[10px] text-muted-foreground">
                    +{images.length - 3}
                  </span>
                )}
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/* ─── Reference list at bottom of answer ─── */
function ReferenceList({ sources }: { sources: Source[] }) {
  const unique = [...new Map(sources.map((s, i) => [i, s])).values()];
  if (unique.length === 0) return null;

  return (
    <div className="mt-2 pt-1.5 border-t border-border/20 flex flex-wrap items-center gap-x-1 gap-y-0.5">
      <span className="text-[10px] text-muted-foreground/40 mr-0.5">Sources:</span>
      {unique.map((s, i) => (
        <span key={i} className="text-[10px] text-muted-foreground/40">
          {s.source_url ? (
            <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">
              [{i + 1}] {s.title}
            </a>
          ) : (
            <span>[{i + 1}] {s.title}</span>
          )}
          {i < unique.length - 1 && <span className="mx-1">·</span>}
        </span>
      ))}
    </div>
  );
}

/* ─── Markdown with inline citations ─── */
function MarkdownWithCitations({ content, sources }: { content: string; sources?: Source[] }) {
  const markdownComponents: Components = {
    // Intercept text nodes to find [N] patterns
    p: ({ children, ...props }) => {
      return <p {...props}>{processChildren(children, sources ?? [])}</p>;
    },
    li: ({ children, ...props }) => {
      return <li {...props}>{processChildren(children, sources ?? [])}</li>;
    },
    td: ({ children, ...props }) => {
      return <td {...props}>{processChildren(children, sources ?? [])}</td>;
    },
    th: ({ children, ...props }) => {
      return <th {...props}>{processChildren(children, sources ?? [])}</th>;
    },
    // Detect UI navigation paths in bold text: **Configure > Gateway > VPN**
    strong: ({ children, ...props }) => {
      const text = typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
      // If text contains " > " separators, render as UI path breadcrumb
      if (typeof text === "string" && text.includes(" > ")) {
        const segments = text.split(/\s*>\s*/);
        return (
          <span className="inline-flex items-center gap-0.5 rounded bg-muted/70 px-1.5 py-0.5 text-[12px] font-medium text-foreground/90" style={{ fontFamily: "var(--font-sans)" }}>
            {segments.map((seg, i) => (
              <span key={i} className="inline-flex items-center gap-0.5">
                {i > 0 && <span className="text-muted-foreground/40 mx-0.5">›</span>}
                <span>{seg.trim()}</span>
              </span>
            ))}
          </span>
        );
      }
      return <strong {...props}>{processChildren(children, sources ?? [])}</strong>;
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}

function processChildren(children: React.ReactNode, sources: Source[]): React.ReactNode {
  if (!children) return children;
  if (typeof children === "string") {
    return processTextWithCitations(children, sources);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        return <span key={i}>{processTextWithCitations(child, sources)}</span>;
      }
      return child;
    });
  }
  return children;
}

function processTextWithCitations(text: string, sources: Source[]): React.ReactNode {
  // Match [1], [2], etc. but not [Source 1 ...] patterns
  const parts = text.split(/(\[\d+\])/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      return <CitationTooltip key={i} index={idx} sources={sources} />;
    }
    return part;
  });
}

/* ─── Parse follow-ups from text after --- separator ─── */
function parseFollowUps(text: string): { answer: string; followUps: string[] } {
  // Find the last --- separator
  const separatorIdx = text.lastIndexOf("\n---\n");
  if (separatorIdx === -1) return { answer: text, followUps: [] };

  const answerPart = text.slice(0, separatorIdx).replace(/\n+$/, "");
  const afterSeparator = text.slice(separatorIdx + 5).trim();

  // Parse lines after separator as follow-up questions
  const lines = afterSeparator.split("\n").map((l) => l.trim()).filter(Boolean);
  const followUps: string[] = [];
  for (const line of lines) {
    // Remove numbered prefixes like "1. ", "2) ", "- ", etc.
    const cleaned = line.replace(/^[\d]+[.)]\s*/, "").replace(/^[-*]\s*/, "").trim();
    if (cleaned.length > 5 && cleaned.length < 200) {
      followUps.push(cleaned);
    }
  }

  return { answer: answerPart, followUps: followUps.slice(0, 3) };
}

/* ─── Main AskChat component ─── */
export interface AskChatProps {
  /** Compact mode for panel usage */
  compact?: boolean;
}

export function AskChat({ compact = false }: AskChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("gemini-2.5-flash");
  const [persona, setPersona] = useState("default");
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profile, setProfile] = useState("default");
  const [availableProviders, setAvailableProviders] = useState<Record<string, boolean>>({});
  const [welcomeSubtitle, setWelcomeSubtitle] = useState<string | null>(null);
  const [welcomeDescription, setWelcomeDescription] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // For panel mode: session list view toggle
  const [showSessionList, setShowSessionList] = useState(false);

  useEffect(() => {
    fetch("/api/ask").then((r) => r.json()).then((d) => {
      if (d.ok) {
        setPersonas(d.personas);
        setProfiles(d.profiles ?? []);
        if (d.welcome?.subtitle) setWelcomeSubtitle(d.welcome.subtitle);
        if (d.welcome?.description) setWelcomeDescription(d.welcome.description);
      }
    }).catch(() => {});
    fetch("/api/settings/providers").then((r) => r.json()).then((d) => setAvailableProviders(d)).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 100);
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
        body: JSON.stringify({
          id: sessionId || undefined, title, persona, provider, profile,
          messages: msgs.map((m) => ({ role: m.role, content: m.content, sources: m.sources, provider: m.provider, followUps: m.followUps, imageMap: m.imageMap })),
        }),
      });
      const data = await res.json();
      if (data.ok && data.id && !sessionId) setSessionId(data.id);
      fetchSessions();
    } catch { /* ignore */ }
  }, [sessionId, persona, provider, profile, fetchSessions]);

  function scheduleSave(msgs: Message[]) {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveSession(msgs), 1000);
  }

  /* ─── SSE Streaming submit ─── */
  async function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", content: q };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    // Create a placeholder assistant message for streaming
    const assistantMsg: Message = { role: "assistant", content: "", isStreaming: true };
    setMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q, provider, persona, profile,
          history: newMessages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        const finalMessages = [...newMessages, { role: "assistant" as const, content: `Error: Server error (${res.status}). ${errText.slice(0, 200)}` }];
        setMessages(finalMessages);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let streamSources: Source[] = [];
      let streamFollowUps: string[] = [];
      let streamImageMap: Record<string, string[]> = {};
      let streamProvider = provider;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;

          try {
            const event = JSON.parse(payload);
            if (event.type === "chunk") {
              fullContent += event.content;
              // Update the assistant message in-place
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: fullContent };
                }
                return updated;
              });
            } else if (event.type === "sources") {
              streamSources = event.sources ?? [];
            } else if (event.type === "metadata") {
              streamFollowUps = event.follow_ups ?? [];
              streamImageMap = event.image_map ?? {};
              streamProvider = event.provider ?? provider;
            }
          } catch {
            // skip unparseable
          }
        }
      }

      // Parse follow-ups from the text (after --- separator)
      const { answer, followUps: parsedFollowUps } = parseFollowUps(fullContent);
      const finalFollowUps = parsedFollowUps.length > 0 ? parsedFollowUps : streamFollowUps;

      const finalAssistantMsg: Message = {
        role: "assistant",
        content: answer,
        sources: streamSources,
        followUps: finalFollowUps,
        imageMap: Object.keys(streamImageMap).length > 0 ? streamImageMap : undefined,
        provider: streamProvider,
        isStreaming: false,
      };

      const finalMessages = [...newMessages, finalAssistantMsg];
      setMessages(finalMessages);
      scheduleSave(finalMessages);
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  function handleNewChat() { setMessages([]); setSessionId(null); setShowSessionList(false); }

  async function handleLoadSession(id: string) {
    try {
      const res = await fetch(`/api/chat-sessions?id=${id}`);
      if (!res.ok) return;
      const rawText = await res.text();
      let data;
      try { data = JSON.parse(rawText); } catch { return; }
      if (data.ok && data.session) {
        const msgs = Array.isArray(data.session.messages) ? data.session.messages : [];
        setMessages(msgs);
        setSessionId(id);
        setPersona(data.session.persona || "default");
        setProvider(data.session.provider || "gemini-2.5-flash");
        setShowSidebar(false);
        setShowSessionList(false);
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

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} conversations?`)) return;
    try {
      await fetch("/api/chat-sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (sessionId && selectedIds.has(sessionId)) handleNewChat();
      setSelectedIds(new Set());
      setSelectMode(false);
      fetchSessions();
    } catch { /* ignore */ }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
  const currentModelLabel = PROVIDERS.flatMap((g) => g.models).find((m) => m.id === provider)?.label ?? provider;
  const currentPersonaLabel = personas.find((p) => p.id === persona);
  const currentProfileLabel = profiles.find((p) => p.id === profile);
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant" && m.provider);
  const lastUsedModel = lastAssistantMsg?.provider;

  // Current session title
  const currentSessionTitle = messages.length > 0
    ? (messages.find((m) => m.role === "user")?.content.slice(0, 40) ?? "Chat")
    : "New Chat";

  /* ─── Session list view (for compact/panel mode) ─── */
  if (compact && showSessionList) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2.5 border-b flex-shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">History</span>
          <div className="flex items-center gap-1">
            {sessions.length > 0 && (
              <button
                onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
                className={`rounded px-1.5 py-0.5 text-xs transition-colors ${selectMode ? "bg-engenius-blue text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
            )}
            <button onClick={() => setShowSessionList(false)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </div>
        </div>
        {selectMode && selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-3 py-2 border-b bg-red-50 flex-shrink-0">
            <span className="text-xs text-red-700">{selectedIds.size} selected</span>
            <button onClick={handleBatchDelete} className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors">Delete</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground/50">No conversations yet</div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => selectMode ? toggleSelect(s.id) : handleLoadSession(s.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors group ${
                  sessionId === s.id && !selectMode ? "bg-muted" : ""
                } ${selectedIds.has(s.id) ? "bg-engenius-blue/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  {selectMode && (
                    <div className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded border-2 transition-colors ${
                      selectedIds.has(s.id) ? "bg-engenius-blue border-engenius-blue" : "border-muted-foreground/30"
                    }`}>
                      {selectedIds.has(s.id) && (
                        <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3 5-5" /></svg>
                      )}
                    </div>
                  )}
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
    );
  }

  return (
    <div className={compact ? "flex flex-col h-full overflow-hidden" : "flex h-[calc(100vh-120px)] gap-0"}>
      {/* ===== Sidebar (non-compact mode only) ===== */}
      {!compact && (
        <div
          className={`flex-shrink-0 overflow-hidden transition-all duration-200 ease-in-out ${
            showSidebar ? "w-60 border-r mr-4" : "w-0"
          }`}
        >
          <div className="w-60 h-full flex flex-col bg-background">
            <div className="flex items-center justify-between px-3 py-2.5 border-b">
              <span className="text-xs font-semibold text-muted-foreground">History</span>
              <div className="flex items-center gap-1">
                {sessions.length > 0 && (
                  <button
                    onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
                    className={`rounded px-1.5 py-0.5 text-xs transition-colors ${selectMode ? "bg-engenius-blue text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                    title="Select multiple"
                  >
                    {selectMode ? "Cancel" : "Select"}
                  </button>
                )}
                <button onClick={handleNewChat} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="New conversation">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg>
                </button>
                <button onClick={() => setShowSidebar(false)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                </button>
              </div>
            </div>

            {/* Batch delete bar */}
            {selectMode && selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-b bg-red-50">
                <span className="text-xs text-red-700">{selectedIds.size} selected</span>
                <button onClick={handleBatchDelete} className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors">
                  Delete
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground/50">No conversations yet</div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectMode ? toggleSelect(s.id) : handleLoadSession(s.id)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors group ${
                      sessionId === s.id && !selectMode ? "bg-muted" : ""
                    } ${selectedIds.has(s.id) ? "bg-engenius-blue/5" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {selectMode && (
                        <div className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded border-2 transition-colors ${
                          selectedIds.has(s.id) ? "bg-engenius-blue border-engenius-blue" : "border-muted-foreground/30"
                        }`}>
                          {selectedIds.has(s.id) && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3 5-5" /></svg>
                          )}
                        </div>
                      )}
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
      )}

      {/* ===== Main area ===== */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <div className={`flex-shrink-0 space-y-2 ${compact ? "px-3 py-2" : "mb-3"}`}>
          {/* Title row */}
          {compact ? (
            /* Panel mode header: session title + history + new chat */
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground truncate max-w-[200px]">{currentSessionTitle}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowSessionList(true)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="History"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                </button>
                <button onClick={handleNewChat} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="New conversation">
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg>
                </button>
              </div>
            </div>
          ) : (
            /* Full page header */
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setShowSidebar(!showSidebar)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Conversation history">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                </button>
                <h1 className="text-lg font-bold tracking-tight">Ask SpecHub</h1>
              </div>
              {messages.length > 0 && (
                <button onClick={handleNewChat} className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="New conversation">
                  + New
                </button>
              )}
            </div>
          )}

          {/* Persona + Profile selector row */}
          <div className={`flex items-center ${compact ? "gap-3 flex-wrap" : "gap-6"}`}>
            {/* Dimension 1: Persona */}
            {personas.length > 0 && (
              <div className="flex items-center gap-2">
                {!compact && <span className="text-xs text-muted-foreground flex-shrink-0">Persona:</span>}
                <div className="flex gap-1.5">
                  {personas.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPersona(p.id)}
                      title={p.description}
                      className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all ${
                        persona === p.id
                          ? "bg-engenius-blue text-white shadow-sm"
                          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                      }`}
                    >
                      {compact ? p.name.split(" ")[0] : p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dimension 2: User Profile */}
            {profiles.length > 1 && (
              <div className="flex items-center gap-2">
                {!compact && <span className="text-xs text-muted-foreground flex-shrink-0">Profile:</span>}
                <select
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Chat card */}
        <Card className={`flex flex-col flex-1 min-h-0 shadow-sm overflow-hidden ${compact ? "border-0 rounded-none shadow-none" : ""}`}>
          <div ref={scrollRef} className={`flex-1 overflow-y-auto space-y-4 ${compact ? "px-3 py-3" : "px-5 py-4"}`}>
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <AssistantIcon size={compact ? 44 : 56} />
                <h2 className={`font-semibold mt-4 mb-0.5 ${compact ? "text-sm" : "text-lg"}`}>
                  {welcomeSubtitle || getGreeting()}
                </h2>
                <p className={`text-muted-foreground mb-5 max-w-sm ${compact ? "text-xs" : "text-sm"}`}>
                  {welcomeDescription || "I'm your EnGenius product specialist. Ask me about specs, configurations, licensing, or best practices."}
                </p>
                <div className={`grid gap-2 w-full ${compact ? "grid-cols-1 max-w-xs" : "grid-cols-2 max-w-xl"}`}>
                  {EXAMPLE_QUESTIONS.slice(0, compact ? 4 : 8).map((q) => (
                    <button key={q} onClick={() => handleSubmit(q)}
                      className="rounded-lg border px-3 py-2.5 text-left text-xs text-muted-foreground hover:border-engenius-blue/40 hover:text-foreground hover:bg-muted/30 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
                  {msg.role === "user" ? (
                    <div className={`rounded-xl px-4 py-2.5 bg-engenius-blue text-white text-sm leading-relaxed ${compact ? "max-w-[90%]" : "max-w-[80%]"}`}>
                      {msg.content}
                    </div>
                  ) : (
                    <div className="flex gap-2.5 text-sm leading-relaxed group/msg">
                      {/* AI avatar */}
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="h-6 w-6 rounded-full bg-engenius-blue/10 flex items-center justify-center">
                          <svg className="h-3.5 w-3.5 text-engenius-blue" viewBox="0 0 48 48" fill="none">
                            <circle cx="24" cy="24" r="6" fill="currentColor" opacity="0.9" />
                            <circle cx="24" cy="7" r="2.5" fill="currentColor" opacity="0.5" />
                            <circle cx="24" cy="41" r="2.5" fill="currentColor" opacity="0.5" />
                            <circle cx="7" cy="24" r="2.5" fill="currentColor" opacity="0.5" />
                            <circle cx="41" cy="24" r="2.5" fill="currentColor" opacity="0.5" />
                            <line x1="24" y1="15" x2="24" y2="8" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
                            <line x1="24" y1="33" x2="24" y2="40" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
                            <line x1="15" y1="24" x2="8" y2="24" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
                            <line x1="33" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
                            <path d="M36 10 L37.5 13.5 L41 15 L37.5 16.5 L36 20 L34.5 16.5 L31 15 L34.5 13.5 Z" fill="currentColor" opacity="0.6" />
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                      <div className="ask-markdown">
                        <MarkdownWithCitations content={msg.content} sources={msg.sources} />
                        {msg.isStreaming && (
                          <span className="inline-block w-2 h-4 bg-engenius-blue/60 animate-pulse ml-0.5 rounded-sm" />
                        )}
                      </div>

                      {/* Reference list (replaces old source badges) */}
                      {!msg.isStreaming && msg.sources && msg.sources.length > 0 && (
                        <ReferenceList sources={msg.sources} />
                      )}

                      {/* Action bar: copy + provider */}
                      {!msg.isStreaming && (
                        <div className="mt-2 pt-1.5 flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                              const el = document.getElementById(`copy-icon-${i}`);
                              if (el) { el.setAttribute("data-copied", "true"); setTimeout(() => el.removeAttribute("data-copied"), 1500); }
                            }}
                            id={`copy-icon-${i}`}
                            className="group/copy text-muted-foreground/70 hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                            title="Copy"
                          >
                            <svg className="h-3.5 w-3.5 group-data-[copied]/copy:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                            <svg className="h-3.5 w-3.5 hidden group-data-[copied]/copy:block text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          </button>
                          {msg.provider && (
                            <span className="ml-auto text-xs text-muted-foreground/30">via {msg.provider}</span>
                          )}
                        </div>
                      )}

                      {/* Follow-up questions */}
                      {!msg.isStreaming && msg.followUps && msg.followUps.length > 0 && i === messages.length - 1 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {msg.followUps.map((q, qi) => (
                            <button
                              key={qi}
                              onClick={() => handleSubmit(q)}
                              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border transition-all"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Loading state — clean, minimal */}
            {loading && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-2.5 py-2 pl-9">
                <div className="h-4 w-4 rounded-full border-2 border-engenius-blue/30 border-t-engenius-blue animate-spin" />
                <span className="text-xs text-muted-foreground/70">搜尋資料思考中...</span>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className={`border-t space-y-2 flex-shrink-0 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
            {/* Model selector */}
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
                        if (isOpen) { setOpenDropdown(null); } else { setOpenDropdown(group.id); }
                      }}
                      disabled={!isAvailable}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-all ${
                        isActiveGroup
                          ? "bg-engenius-blue text-white shadow-sm"
                          : isAvailable
                            ? "bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
                            : "bg-muted/50 text-muted-foreground/30 cursor-not-allowed line-through"
                      }`}
                    >
                      {compact ? (isActiveGroup ? activeModel.label.split(" ").pop() : group.label) : (isActiveGroup ? activeModel.label : group.label)}
                      {isAvailable && (
                        <svg className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 5l3 3 3-3" />
                        </svg>
                      )}
                    </button>

                    {isOpen && (
                      <div className="absolute bottom-full left-0 mb-1 w-48 rounded-lg border bg-background shadow-lg py-1 z-50">
                        <div className="px-3 py-1 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider">
                          {group.label}
                        </div>
                        {group.models.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => { setProvider(model.id); setOpenDropdown(null); }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors flex items-center justify-between ${
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
            <div className="relative">
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Ask, search, or explain..."
                rows={compact ? 2 : 2}
                className="w-full resize-none rounded-xl border border-input bg-background px-4 pt-3 pb-10 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/20 focus:border-engenius-blue/30"
                style={{ minHeight: compact ? 72 : 80, maxHeight: compact ? 120 : 160 }}
              />
              <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
                  <span className="inline-flex items-center justify-center rounded bg-engenius-blue/10 text-engenius-blue px-1 py-0.5 text-[10px] font-semibold leading-none">AI</span>
                  Based on EnGenius product data
                </span>
                <button onClick={() => handleSubmit()} disabled={loading || !input.trim()}
                  className="rounded-lg bg-engenius-blue/90 px-3.5 py-1 text-xs font-medium text-white hover:bg-engenius-blue disabled:bg-muted disabled:text-muted-foreground/40 transition-colors">
                  {loading ? "..." : "Send"}
                </button>
              </div>
            </div>
            {/* Current model info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground/30 px-1">
              <span className="truncate">
                {currentModelLabel}
                {currentPersonaLabel ? ` · ${currentPersonaLabel.name}` : ""}
                {currentProfileLabel && currentProfileLabel.id !== "default" ? ` · ${currentProfileLabel.label}` : ""}
              </span>
              {!compact && lastUsedModel && (
                <span>Last via {lastUsedModel}</span>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
