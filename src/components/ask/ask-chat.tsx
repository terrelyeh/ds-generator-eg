"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Card } from "@/components/ui/card";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { CodeBlock } from "@/components/chat/code-block";
import {
  useChatStream,
  type ChatMessage as Message,
  type ChatSource as Source,
} from "@/hooks/use-chat-stream";

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
    checkKeys: ["gemini-3.5-flash"],
    models: [
      { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", tier: "Strongest" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", tier: "Mainstream" },
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", tier: "Best CP" },
    ],
  },
  {
    id: "openai",
    label: "GPT",
    checkKeys: ["gpt-5.5"],
    models: [
      { id: "gpt-5.5", label: "GPT-5.5", tier: "Strongest" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", tier: "Mainstream" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", tier: "Best CP" },
    ],
  },
  {
    id: "claude",
    label: "Claude",
    checkKeys: ["claude-sonnet", "claude-opus"],
    models: [
      { id: "claude-opus", label: "Claude Opus 4.8", tier: "Strongest" },
      { id: "claude-sonnet", label: "Claude Sonnet 4.6", tier: "Mainstream" },
      { id: "claude-haiku", label: "Claude Haiku 4.5", tier: "Best CP" },
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
  // Citations are linkable for:
  //   - External http URLs (gitbook, helpcenter, google_doc)
  //   - Internal relative paths for wifi_regulation (/wifi-regulation/{code})
  // product_spec intentionally not linkable (no canonical public page yet).
  const isExternal = !!src.source_url?.startsWith("http") && src.source_type !== "product_spec";
  const isInternal = !!src.source_url?.startsWith("/") && src.source_type === "wifi_regulation";
  const hasExternalLink = isExternal || isInternal;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {hasExternalLink ? (
        <a href={src.source_url!} target="_blank" rel="noopener noreferrer">
          <sup className="text-engenius-blue/70 font-medium cursor-pointer hover:text-engenius-blue hover:underline text-[10px]">
            [{index}]
          </sup>
        </a>
      ) : (
        <sup className="text-engenius-blue/70 font-medium cursor-default text-[10px]">
          [{index}]
        </sup>
      )}
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 rounded-xl border bg-white shadow-xl text-xs pointer-events-auto"
          style={{ width: images.length > 0 ? 320 : 220 }}>
          <span className="block px-3 pt-2.5 pb-2">
            <span className="font-semibold text-foreground block truncate leading-tight">{src.title}</span>
            <span className="flex items-center gap-1.5 mt-0.5">
              <span className="text-muted-foreground">{SOURCE_TYPE_LABEL[src.source_type] ?? src.source_type}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/50">{Math.round(src.similarity * 100)}%</span>
            </span>
          </span>
          {images.length > 0 && (
            <span className="block border-t px-2.5 py-2.5">
              <span className="flex flex-col gap-2">
                {images.slice(0, 2).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="block rounded-lg border overflow-hidden hover:ring-2 hover:ring-engenius-blue/40 transition-all cursor-pointer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Ref ${index}-${i + 1}`} loading="lazy"
                      className="w-full h-auto max-h-36 object-contain bg-slate-50" />
                  </a>
                ))}
                {images.length > 2 && (
                  <span className="text-[10px] text-muted-foreground/50 text-center">
                    +{images.length - 2} more — click to view
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
    <details className="mt-3 pt-2 border-t border-border/30">
      <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors select-none">
        📎 {unique.length} sources referenced
      </summary>
      <div className="mt-1.5 space-y-0.5">
        {unique.map((s, i) => (
          <div key={i} className="text-xs text-muted-foreground/50 truncate">
            {s.source_url ? (
              <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-engenius-blue transition-colors">
                [{i + 1}] {s.title}
              </a>
            ) : (
              <span>[{i + 1}] {s.title}</span>
            )}
          </div>
        ))}
      </div>
    </details>
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
    // Fenced code blocks → shared CodeBlock (language label + copy + dark body)
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, detect: true }]]}
      components={markdownComponents}
    >
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
  // Match citation patterns: [1], [2], [1, 3, 4], [1,3], [1, 2, 5, 9] etc.
  const parts = text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    // Single citation: [1]
    const singleMatch = part.match(/^\[(\d+)\]$/);
    if (singleMatch) {
      const idx = parseInt(singleMatch[1], 10);
      return <CitationTooltip key={i} index={idx} sources={sources} />;
    }
    // Multi citation: [1, 3, 4] — render each as individual tooltip
    const multiMatch = part.match(/^\[([\d\s,]+)\]$/);
    if (multiMatch) {
      const nums = multiMatch[1].split(",").map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
      if (nums.length > 0) {
        // Only show the first 2 to avoid clutter
        const shown = nums.slice(0, 2);
        return (
          <span key={i}>
            {shown.map((idx, j) => (
              <CitationTooltip key={j} index={idx} sources={sources} />
            ))}
          </span>
        );
      }
    }
    return part;
  });
}

/* ─── AI message avatar (the little node icon beside each reply) ─── */
function AskAvatar() {
  return (
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
  );
}

/* ─── Memoized message row ─── */
/* Memoized so settled messages don't re-render on every streaming frame —
   only the streaming message (whose `message` identity changes) re-renders. */
const AskMessage = memo(function AskMessage({
  message,
  isLast,
  compact,
  loadingStatus,
  onFollowUp,
  onRegenerate,
}: {
  message: Message;
  isLast: boolean;
  compact: boolean;
  loadingStatus: "searching" | "generating" | null;
  onFollowUp: (q: string) => void;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-300">
        <div className={`rounded-2xl rounded-br-md px-4 py-2.5 bg-engenius-blue text-white text-[15px] leading-relaxed ${compact ? "max-w-[90%]" : "max-w-[80%]"}`}>
          {message.content}
        </div>
      </div>
    );
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  }

  const thinking = !message.content && message.isStreaming;

  return (
    <div className="flex gap-2.5 group/msg animate-in fade-in duration-300">
      <div className="flex-shrink-0 mt-0.5">
        <AskAvatar />
      </div>
      <div className="flex-1 min-w-0">
        {message.content ? (
          <div className="ask-markdown max-w-[46rem]">
            <MarkdownWithCitations content={message.content} sources={message.sources} />
            {message.isStreaming && (
              <span className="inline-block w-[3px] h-[1.05em] translate-y-[0.15em] bg-engenius-blue/70 animate-pulse ml-0.5 rounded-[1px]" />
            )}
          </div>
        ) : thinking ? (
          <div className="flex items-center gap-2.5 py-1.5">
            <span className="h-4 w-4 rounded-full border-2 border-engenius-blue/30 border-t-engenius-blue animate-spin" />
            <span className="text-xs text-muted-foreground/70">
              {loadingStatus === "generating" ? "整理回覆中…" : "搜尋相關資料中…"}
            </span>
          </div>
        ) : null}

        {/* Reference list */}
        {!message.isStreaming && message.sources && message.sources.length > 0 && (
          <ReferenceList sources={message.sources} />
        )}

        {/* Action bar: copy + provider */}
        {!message.isStreaming && message.content && (
          <div className="mt-2 pt-1.5 flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="text-muted-foreground/70 hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
              title="Copy"
            >
              {copied ? (
                <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="text-muted-foreground/70 hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                title="Regenerate"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
              </button>
            )}
            {message.provider && (
              <span className="ml-auto text-xs text-muted-foreground/30">via {message.provider}</span>
            )}
          </div>
        )}

        {/* Follow-up questions (last message only) */}
        {!message.isStreaming && message.followUps && message.followUps.length > 0 && isLast && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.followUps.map((q, qi) => (
              <button
                key={qi}
                onClick={() => onFollowUp(q)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

/* ─── Main AskChat component ─── */
export interface AskChatProps {
  /** Compact mode for panel usage */
  compact?: boolean;
}

export function AskChat({ compact = false }: AskChatProps) {
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState("gemini-3.5-flash");
  const [persona, setPersona] = useState("default");
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profile, setProfile] = useState("default");
  const [availableProviders, setAvailableProviders] = useState<Record<string, boolean>>({});
  const [welcomeSubtitle, setWelcomeSubtitle] = useState<string | null>(null);
  const [welcomeDescription, setWelcomeDescription] = useState<string | null>(null);
  const [customQuestions, setCustomQuestions] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Shared chat streaming engine — owns messages/loading/status + the
  // stream/abort/regenerate logic (identical to the EnGenie demo).
  const { messages, setMessages, loading, loadingStatus, submit, stop, regenerate } = useChatStream({
    getParams: () => ({ provider, persona, profile }),
    onComplete: (m) => scheduleSave(m),
  });

  const { ref: scrollRef, isAtBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>([messages, loading]);

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
        if (d.welcome?.example_questions) setCustomQuestions(d.welcome.example_questions);
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

  // Auto-grow the input textarea up to a cap (mirrors the demo).
  const autosize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, compact ? 120 : 160) + "px";
  }, [compact]);

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
  // Core streaming routine shared by submit + regenerate. `base` is the
  // conversation up to and including the user question being answered.
  // Submit from the input box / example chips. The streaming itself lives in
  // useChatStream; this just handles the textarea (clear + autosize).
  function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    requestAnimationFrame(autosize);
    submit(q);
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
        setProvider(data.session.provider || "gemini-3.5-flash");
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
    // Display-only relative time for the session list — reading "now" during
    // render is intentional and harmless (re-renders just refresh the label).
    // eslint-disable-next-line react-hooks/purity
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
        <div className={`flex-shrink-0 ${compact ? "px-5 pt-3 pb-2" : "mb-3"}`}>
          {compact ? (
            <>
              {/* Row 1: Session title + history/new */}
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-semibold text-foreground truncate max-w-[300px]">
                  {currentSessionTitle}
                </h3>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setShowSessionList(true)}
                    className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                    title="History"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button onClick={handleNewChat} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors" title="New chat">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg>
                  </button>
                </div>
              </div>

              {/* Row 2: Persona (left) + Profile (right) */}
              <div className="flex items-center justify-between">
                {personas.length > 0 && (
                  <div className="flex gap-1.5">
                    {personas.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPersona(p.id)}
                        title={p.description}
                        className={`cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-all ${
                          persona === p.id
                            ? "bg-engenius-blue text-white shadow-sm"
                            : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                        }`}
                      >
                        {p.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                )}
                {profiles.length > 1 && (
                  <select
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-[11px] text-muted-foreground cursor-pointer focus:outline-none"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Full page: Title + new */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowSidebar(!showSidebar)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="History">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                  </button>
                  <h1 className="text-lg font-bold tracking-tight">Ask SpecHub</h1>
                </div>
                {messages.length > 0 && (
                  <button onClick={handleNewChat} className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">+ New</button>
                )}
              </div>
              {/* Full page: Persona (left) + Profile (right) */}
              <div className="flex items-center justify-between">
                {personas.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground flex-shrink-0">Persona:</span>
                    <div className="flex gap-1.5">
                      {personas.map((p) => (
                        <button key={p.id} onClick={() => setPersona(p.id)} title={p.description}
                          className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all ${persona === p.id ? "bg-engenius-blue text-white shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"}`}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {profiles.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Profile:</span>
                    <select value={profile} onChange={(e) => setProfile(e.target.value)}
                      className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-engenius-blue/30">
                      {profiles.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}
        </div>


        {/* Chat card */}
        <Card className={`relative flex flex-col flex-1 min-h-0 shadow-sm overflow-hidden ${compact ? "border-0 rounded-none shadow-none" : ""}`}>
          <div className="relative flex-1 min-h-0">
          <div ref={scrollRef} className={`h-full overflow-y-auto space-y-5 ${compact ? "px-5 py-3" : "px-5 py-4"}`}>
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <AssistantIcon size={compact ? 48 : 60} />
                <h2 className={`font-semibold mt-5 ${compact ? "text-base" : "text-xl"}`}>
                  {welcomeSubtitle || getGreeting()}
                </h2>
                <p className={`text-muted-foreground mt-1.5 max-w-sm ${compact ? "text-xs" : "text-sm"}`}>
                  {welcomeDescription || "I'm your EnGenius product specialist. Ask me about specs, configurations, licensing, or best practices."}
                </p>
                <div className={`w-full ${compact ? "mt-6" : "mt-8"}`} />
                <div className={`grid gap-2 w-full ${compact ? "grid-cols-1 max-w-xs" : "grid-cols-2 max-w-xl"}`}>
                  {(customQuestions || EXAMPLE_QUESTIONS).slice(0, compact ? 4 : 8).map((q) => (
                    <button key={q} onClick={() => handleSubmit(q)}
                      className="rounded-lg border px-3 py-2.5 text-left text-xs text-muted-foreground hover:border-engenius-blue/40 hover:text-foreground hover:bg-muted/30 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <AskMessage
                  key={i}
                  message={msg}
                  isLast={i === messages.length - 1}
                  compact={compact}
                  loadingStatus={msg.isStreaming ? loadingStatus : null}
                  onFollowUp={submit}
                  onRegenerate={
                    i === messages.length - 1 && msg.role === "assistant" && !msg.isStreaming && !loading
                      ? regenerate
                      : undefined
                  }
                />
              ))
            )}
          </div>

          {/* Scroll-to-bottom button */}
          {!isAtBottom && !isEmpty && (
            <button
              onClick={() => scrollToBottom()}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-background/95 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground animate-in fade-in zoom-in duration-200"
              title="Scroll to latest"
              aria-label="Scroll to latest"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </button>
          )}
          </div>

          {/* Input area */}
          <div className={`border-t space-y-2 flex-shrink-0 ${compact ? "px-5 py-2.5" : "px-4 py-3"}`}>
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
                          ? "bg-[#3a3f47] text-white shadow-sm"
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
              <textarea ref={inputRef} value={input} onChange={(e) => { setInput(e.target.value); autosize(); }} onKeyDown={handleKeyDown}
                placeholder="Ask, search, or explain..."
                rows={2}
                className="w-full resize-none overflow-y-auto rounded-xl border border-input bg-background px-4 pt-3 pb-10 text-[15px] shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/20 focus:border-engenius-blue/30"
                style={{ minHeight: compact ? 72 : 80, maxHeight: compact ? 120 : 160 }}
              />
              <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
                  <span className="inline-flex items-center justify-center rounded bg-engenius-blue/10 text-engenius-blue px-1 py-0.5 text-[10px] font-semibold leading-none">AI</span>
                  Based on EnGenius product data
                </span>
                {loading ? (
                  <button onClick={stop}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#3a3f47] px-3 py-1 text-xs font-medium text-white hover:bg-[#2c3038] transition-colors">
                    <span className="h-2.5 w-2.5 rounded-[2px] bg-white" />
                    Stop
                  </button>
                ) : (
                  <button onClick={() => handleSubmit()} disabled={!input.trim()}
                    className="rounded-lg bg-engenius-blue/90 px-3.5 py-1 text-xs font-medium text-white hover:bg-engenius-blue disabled:bg-muted disabled:text-muted-foreground/40 transition-colors">
                    Send
                  </button>
                )}
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
