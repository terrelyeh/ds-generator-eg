"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EngenieMark } from "./engenie-mark";

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
  isStreaming?: boolean;
}

export interface EngenieChatProps {
  provider: string;
  persona: string;
  profile: string;
  welcomeSubtitle?: string | null;
  welcomeDescription?: string | null;
  exampleQuestions?: string[];
}

const FALLBACK_QUESTIONS = [
  "哪些 AP 支援 WiFi 7？",
  "ECC100 和 ECC500 差在哪裡？",
  "怎麼設定 Site-to-Site VPN？",
  "推薦適合飯店的網路方案",
];

export function EngenieChat({
  provider,
  persona,
  profile,
  welcomeSubtitle,
  welcomeDescription,
  exampleQuestions,
}: EngenieChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // rAF-batched streaming: accumulate chunks in a ref, flush to state once per frame
  const pendingContentRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);

  const scheduleFlush = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const content = pendingContentRef.current;
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, content };
        }
        return updated;
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  async function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    requestAnimationFrame(autosize);

    const userMsg: Message = { role: "user", content: q };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "", isStreaming: true }]);
    setLoading(true);
    pendingContentRef.current = "";

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          provider,
          persona,
          profile,
          history: history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        setMessages([
          ...history,
          { role: "assistant", content: `Error: ${res.status}. ${errText.slice(0, 200)}` },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let streamSources: Source[] = [];

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
              pendingContentRef.current = fullContent;
              scheduleFlush();
            } else if (event.type === "sources") {
              streamSources = event.sources ?? [];
            }
          } catch {
            /* skip */
          }
        }
      }

      // Final flush — cancel pending rAF and commit final state
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const sepIdx = fullContent.lastIndexOf("\n---\n");
      const finalContent = sepIdx >= 0 ? fullContent.slice(0, sepIdx).trimEnd() : fullContent;

      setMessages([
        ...history,
        {
          role: "assistant",
          content: finalContent,
          sources: streamSources,
          isStreaming: false,
        },
      ]);
    } catch (err) {
      setMessages([
        ...history,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const isEmpty = messages.length === 0;
  const questions = exampleQuestions?.length ? exampleQuestions : FALLBACK_QUESTIONS;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 pb-8">
            <EngenieMark size={56} />
            <h2
              className="mt-7 text-center text-[30px] font-normal leading-[1.2] tracking-[-0.01em] text-engenius-dark"
              style={{ fontFamily: "ui-serif, Georgia, 'Times New Roman', serif" }}
            >
              {welcomeSubtitle || "How can I help you today?"}
            </h2>
            {welcomeDescription && (
              <p className="mt-3 max-w-[280px] text-center text-[13px] leading-relaxed text-engenius-gray">
                {welcomeDescription}
              </p>
            )}
            <div className="mt-10 flex w-full max-w-[320px] flex-col gap-2">
              {questions.slice(0, 4).map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(q)}
                  className="w-full rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3 text-left text-[13px] text-engenius-dark/90 transition-all hover:border-engenius-blue/40 hover:bg-white"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[720px] px-5 pt-6 pb-8">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 px-3 pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        <div className="mx-auto flex w-full max-w-[720px] items-end gap-2 rounded-[28px] border border-black/[0.08] bg-white px-4 py-2 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] transition-all focus-within:border-engenius-blue/50 focus-within:shadow-[0_4px_20px_-4px_rgba(3,169,244,0.15)]">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            autoFocus
            onChange={(e) => {
              setInput(e.target.value);
              autosize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask EnGenie..."
            disabled={loading}
            className="flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-engenius-dark outline-none placeholder:text-engenius-dark/40 disabled:opacity-50"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-engenius-dark text-white transition-all hover:bg-engenius-dark/90 disabled:bg-engenius-gray/30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Message bubble (memoized to prevent re-render of prior messages during streaming) ─── */
const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="mb-8 flex justify-end">
        <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-engenius-blue/[0.09] px-4 py-3 text-[16px] leading-[1.65] text-engenius-dark">
          {message.content}
        </div>
      </div>
    );
  }

  // Streaming cursor: appear after the last paragraph/heading/list item in the prose
  const cursor =
    "[&_p:last-child]:after:ml-1 [&_p:last-child]:after:inline-block [&_p:last-child]:after:h-[0.95em] [&_p:last-child]:after:w-[2.5px] [&_p:last-child]:after:translate-y-[0.15em] [&_p:last-child]:after:rounded-[1px] [&_p:last-child]:after:bg-engenius-dark/70 [&_p:last-child]:after:animate-pulse [&_p:last-child]:after:content-['']";

  return (
    <div className="mb-8 w-full">
      <div
        className={`prose max-w-none text-[16.5px] text-engenius-dark
          prose-p:my-6 prose-p:leading-[1.85]
          prose-headings:mb-4 prose-headings:font-semibold prose-headings:text-engenius-dark prose-headings:tracking-tight
          prose-h1:mt-10 prose-h1:text-[23px]
          prose-h2:mt-9 prose-h2:text-[20px]
          prose-h3:mt-7 prose-h3:text-[17.5px]
          prose-strong:font-semibold prose-strong:text-engenius-dark
          prose-ul:my-6 prose-ul:pl-5 prose-ol:my-6 prose-ol:pl-5 prose-li:my-2.5 prose-li:leading-[1.8] prose-li:marker:text-engenius-dark/40
          prose-code:rounded prose-code:bg-black/[0.05] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[14px] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-black/[0.04] prose-pre:text-[13.5px] prose-pre:border prose-pre:border-black/[0.06]
          prose-blockquote:border-l-2 prose-blockquote:border-engenius-blue/40 prose-blockquote:pl-4 prose-blockquote:text-engenius-dark/80 prose-blockquote:font-normal prose-blockquote:not-italic
          prose-hr:my-8 prose-hr:border-black/[0.08]
          prose-table:text-[14px] prose-th:bg-black/[0.03] prose-th:py-2.5 prose-th:px-3 prose-td:py-2.5 prose-td:px-3 prose-td:align-top
          ${message.isStreaming && message.content ? cursor : ""}`}
      >
        {message.content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {stripCitations(message.content)}
          </ReactMarkdown>
        ) : message.isStreaming ? (
          <ThinkingOrb />
        ) : null}
      </div>
      {!message.isStreaming && message.content && (
        <ActionBar content={message.content} sources={message.sources} />
      )}
    </div>
  );
});

function ActionBar({ content, sources }: { content: string; sources?: Source[] }) {
  const [copied, setCopied] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const unique = sources ? dedupe(sources) : [];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-5 text-[13.5px] font-medium text-engenius-dark/55">
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 transition-colors hover:text-engenius-dark"
        >
          {copied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>

        {unique.length > 0 && (
          <button
            onClick={() => setRefOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-engenius-dark"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${refOpen ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>{unique.length} references</span>
          </button>
        )}
      </div>
      {refOpen && unique.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {unique.slice(0, 8).map((s, i) => (
            <SourceChip key={i} source={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingOrb() {
  return (
    <div className="py-1">
      <div style={{ animation: "engenieThink 1.6s ease-in-out infinite", transformOrigin: "center", display: "inline-block" }}>
        <EngenieMark size={32} />
      </div>
      <style>{`
        @keyframes engenieThink {
          0%, 100% { transform: scale(0.88); opacity: 0.7; }
          50% { transform: scale(1.08); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function stripCitations(text: string): string {
  return text.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "");
}

function dedupe(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.source_type}:${s.source_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function SourceChip({ source }: { source: Source }) {
  const content = (
    <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-black/[0.14] bg-white px-3 py-1.5 text-[13px] font-medium text-engenius-dark/75 transition-colors hover:border-engenius-blue/50 hover:text-engenius-dark">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <span className="truncate">{source.title}</span>
    </span>
  );
  const isLinkable =
    source.source_url &&
    source.source_type !== "product_spec" &&
    source.source_url.startsWith("http");
  if (isLinkable) {
    return (
      <a href={source.source_url!} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return content;
}
