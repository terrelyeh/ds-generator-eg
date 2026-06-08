"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { EngenieMark } from "./engenie-mark";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { CodeBlock } from "@/components/chat/code-block";

const markdownComponents: Components = {
  // Wrap tables in a horizontal-scroll container so wide comparison
  // tables don't blow out the mobile viewport.
  table: ({ children, ...props }) => (
    <div className="my-5 -mx-5 overflow-x-auto px-5">
      <table {...props} className="min-w-max border-collapse">
        {children}
      </table>
    </div>
  ),
  // Fenced code blocks → shared CodeBlock (language label + copy + dark body)
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
};

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
  followUps?: string[];
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
  // Mirrors the main Ask panel: surface the backend's progress phase
  // ("searching" → "generating") so the demo shows the same live status
  // ("搜尋相關資料中…" / "整理回覆中…") instead of a silent spinner.
  const [loadingStatus, setLoadingStatus] = useState<"searching" | "generating" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { ref: scrollRef, isAtBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>([messages, loading]);

  // rAF-batched streaming: accumulate chunks in a ref, flush to state once per frame
  const pendingContentRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);
  // Aborts the in-flight /api/ask stream when the user hits Stop.
  const abortRef = useRef<AbortController | null>(null);

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
    const t = setTimeout(() => textareaRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  // Core streaming routine shared by submit + regenerate. `base` is the
  // conversation up to and including the user question being answered.
  async function runAsk(q: string, base: Message[]) {
    setMessages([...base, { role: "assistant", content: "", isStreaming: true }]);
    setLoading(true);
    setLoadingStatus("searching");
    pendingContentRef.current = "";

    const controller = new AbortController();
    abortRef.current = controller;

    let fullContent = "";
    let streamSources: Source[] = [];

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question: q,
          provider,
          persona,
          profile,
          history: base.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        setMessages([
          ...base,
          { role: "assistant", content: `Error: ${res.status}. ${errText.slice(0, 200)}` },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            if (event.type === "status") {
              setLoadingStatus(event.status);
            } else if (event.type === "chunk") {
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

      const { answer, followUps } = parseFollowUps(fullContent);

      setMessages([
        ...base,
        {
          role: "assistant",
          content: answer,
          sources: streamSources,
          followUps,
          isStreaming: false,
        },
      ]);
    } catch (err) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        // User hit Stop — keep whatever streamed so far as the final answer.
        const { answer } = parseFollowUps(fullContent);
        const partial = (answer || fullContent).trim();
        setMessages([
          ...base,
          {
            role: "assistant",
            content: partial ? `${partial}\n\n_(已停止)_` : "_(已停止)_",
            sources: streamSources,
            isStreaming: false,
          },
        ]);
      } else {
        setMessages([
          ...base,
          {
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ]);
      }
    } finally {
      setLoading(false);
      setLoadingStatus(null);
      abortRef.current = null;
    }
  }

  async function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    requestAnimationFrame(autosize);
    await runAsk(q, [...messages, { role: "user", content: q }]);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleRegenerate() {
    if (loading) return;
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") { idx = i; break; }
    }
    if (idx === -1) return;
    await runAsk(messages[idx].content, messages.slice(0, idx + 1));
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
      <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} className="h-full overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 pb-8">
            <EngenieMark size={56} />
            <h2
              className="mt-7 text-center text-[30px] font-normal leading-[1.2] tracking-[-0.015em] text-engenius-dark"
              style={{
                fontFamily:
                  "var(--font-serif-display), ui-serif, Georgia, 'Times New Roman', serif",
              }}
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
            {messages.map((m, i) => {
              const isLastAssistant =
                m.role === "assistant" &&
                i === messages.length - 1 &&
                !m.isStreaming;
              return (
                <MessageBubble
                  key={i}
                  message={m}
                  loadingStatus={m.isStreaming ? loadingStatus : null}
                  onFollowUp={isLastAssistant ? handleSubmit : undefined}
                  onRegenerate={isLastAssistant && !loading ? handleRegenerate : undefined}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {!isAtBottom && !isEmpty && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-white text-engenius-dark/70 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.12)] transition-all hover:text-engenius-dark"
          aria-label="Scroll to latest"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
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
            className="flex-1 resize-none bg-transparent py-2 leading-[1.5] text-engenius-dark outline-none placeholder:text-engenius-dark/40 disabled:opacity-50"
            style={{ fontFamily: "inherit", fontSize: "16px" }}
          />
          {loading ? (
            <button
              onClick={handleStop}
              aria-label="Stop"
              className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-engenius-dark text-white transition-all hover:bg-engenius-dark/90"
            >
              <span className="h-3 w-3 rounded-[3px] bg-white" />
            </button>
          ) : (
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim()}
              aria-label="Send"
              className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-engenius-dark text-white transition-all hover:bg-engenius-dark/90 disabled:bg-engenius-gray/30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Message bubble (memoized to prevent re-render of prior messages during streaming) ─── */
const MessageBubble = memo(function MessageBubble({
  message,
  loadingStatus = null,
  onFollowUp,
  onRegenerate,
}: {
  message: Message;
  loadingStatus?: "searching" | "generating" | null;
  onFollowUp?: (q: string) => void;
  onRegenerate?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="mb-8 flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-300">
        <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-engenius-blue/[0.09] px-4 py-3 text-[16px] leading-[1.65] text-engenius-dark">
          {message.content}
        </div>
      </div>
    );
  }

  // Streaming cursor: appear after the last paragraph/heading/list item in the prose
  const cursor =
    "[&_p:last-child]:after:ml-1 [&_p:last-child]:after:inline-block [&_p:last-child]:after:h-[0.95em] [&_p:last-child]:after:w-[2.5px] [&_p:last-child]:after:translate-y-[0.15em] [&_p:last-child]:after:rounded-[1px] [&_p:last-child]:after:bg-engenius-dark/70 [&_p:last-child]:after:animate-pulse [&_p:last-child]:after:content-['']";

  const thinking = !message.content && message.isStreaming;

  // Assistant message: EnGenie mark on the left (pulses while thinking),
  // answer / live status on the right — mirrors the main Ask panel.
  return (
    <div className="mb-8 flex w-full gap-3 animate-in fade-in duration-300">
      <div className="flex-shrink-0 pt-0.5">
        <EngenieAvatar thinking={thinking} />
      </div>
      <div className="min-w-0 flex-1">
        {message.content ? (
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
              ${message.isStreaming ? cursor : ""}`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, detect: true }]]}
              components={markdownComponents}
            >
              {stripCitations(message.content)}
            </ReactMarkdown>
          </div>
        ) : thinking ? (
          <div className="flex items-center gap-2 py-2">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-engenius-dark/30 animate-[engenieDot_1.2s_ease-in-out_infinite]" />
              <span className="h-1.5 w-1.5 rounded-full bg-engenius-dark/30 animate-[engenieDot_1.2s_ease-in-out_0.2s_infinite]" />
              <span className="h-1.5 w-1.5 rounded-full bg-engenius-dark/30 animate-[engenieDot_1.2s_ease-in-out_0.4s_infinite]" />
            </span>
            <span className="text-[13px] text-engenius-gray">
              {loadingStatus === "generating" ? "整理回覆中…" : "搜尋相關資料中…"}
            </span>
            <style>{`
              @keyframes engenieDot {
                0%, 100% { opacity: 0.25; transform: translateY(0); }
                50% { opacity: 0.9; transform: translateY(-2px); }
              }
            `}</style>
          </div>
        ) : null}
        {!message.isStreaming && message.content && (
          <>
            <ActionBar content={message.content} sources={message.sources} onRegenerate={onRegenerate} />
            {onFollowUp && message.followUps && message.followUps.length > 0 && (
              <FollowUpList questions={message.followUps} onClick={onFollowUp} />
            )}
          </>
        )}
      </div>
    </div>
  );
});

/* ─── Small EnGenie avatar shown beside each assistant reply ─── */
function EngenieAvatar({ thinking }: { thinking?: boolean }) {
  return (
    <div
      style={
        thinking
          ? { animation: "engenieThink 1.6s ease-in-out infinite", transformOrigin: "center", display: "inline-block" }
          : undefined
      }
    >
      <EngenieMark size={20} />
      <style>{`
        @keyframes engenieThink {
          0%, 100% { transform: scale(0.9); opacity: 0.75; }
          50% { transform: scale(1.06); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function FollowUpList({
  questions,
  onClick,
}: {
  questions: string[];
  onClick: (q: string) => void;
}) {
  return (
    <div className="mt-6 border-t border-black/[0.06] pt-5">
      <div className="mb-3 font-heading text-[11px] font-extrabold uppercase tracking-[0.16em] text-engenius-dark/55">
        Suggested follow-ups
      </div>
      <div className="flex flex-col gap-2">
        {questions.slice(0, 3).map((q, i) => (
          <button
            key={i}
            onClick={() => onClick(q)}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-black/[0.08] bg-white px-4 py-3 text-left transition-all hover:border-engenius-blue/40 hover:bg-engenius-blue/[0.03]"
          >
            <span className="text-[14px] font-medium leading-snug text-engenius-dark/85">
              {q}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 text-engenius-dark/30 transition-all group-hover:translate-x-0.5 group-hover:text-engenius-blue"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function parseFollowUps(text: string): { answer: string; followUps: string[] } {
  const sepIdx = text.lastIndexOf("\n---\n");
  if (sepIdx === -1) return { answer: text, followUps: [] };
  const answerPart = text.slice(0, sepIdx).replace(/\n+$/, "");
  const afterSeparator = text.slice(sepIdx + 5).trim();
  const lines = afterSeparator.split("\n").map((l) => l.trim()).filter(Boolean);
  const followUps: string[] = [];
  for (const line of lines) {
    const cleaned = line
      .replace(/^[\d]+[.)]\s*/, "")
      .replace(/^[-*]\s*/, "")
      .trim();
    if (cleaned.length > 5 && cleaned.length < 200) followUps.push(cleaned);
  }
  return { answer: answerPart, followUps: followUps.slice(0, 3) };
}

function ActionBar({ content, sources, onRegenerate }: { content: string; sources?: Source[]; onRegenerate?: () => void }) {
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

        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-engenius-dark"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            <span>Retry</span>
          </button>
        )}

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
