"use client";

import { useEffect, useRef, useState } from "react";
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
  const [status, setStatus] = useState<"searching" | "generating" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

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
    setStatus("searching");

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
            if (event.type === "status") {
              setStatus(event.status);
            } else if (event.type === "chunk") {
              fullContent += event.content;
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
            }
          } catch {
            /* skip */
          }
        }
      }

      // Strip trailing follow-ups (after "---")
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
      setStatus(null);
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
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 pb-8">
            <EngenieMark size={64} />
            <h2 className="mt-6 text-center font-heading text-[22px] font-bold tracking-tight text-engenius-dark">
              {welcomeSubtitle || "How can I help you?"}
            </h2>
            {welcomeDescription && (
              <p className="mt-2 max-w-[280px] text-center text-[13px] leading-relaxed text-engenius-gray">
                {welcomeDescription}
              </p>
            )}
            <div className="mt-8 flex w-full max-w-[320px] flex-col gap-2">
              {questions.slice(0, 4).map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(q)}
                  className="w-full rounded-2xl border border-border/60 bg-white px-4 py-3 text-left text-[13px] text-engenius-dark/90 transition-all hover:border-engenius-blue/40 hover:bg-engenius-blue/[0.03]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[720px] px-4 pt-4 pb-6">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {loading && status && (
              <div className="mt-2 flex items-center gap-2 px-1 text-[12px] text-engenius-gray">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-engenius-blue" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-engenius-blue" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-engenius-blue" style={{ animationDelay: "300ms" }} />
                </span>
                <span>{status === "searching" ? "Searching knowledge base..." : "Thinking..."}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 px-3 pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        <div className="mx-auto flex w-full max-w-[720px] items-end gap-2 rounded-[28px] border border-border/60 bg-white px-4 py-2 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] transition-all focus-within:border-engenius-blue/50 focus-within:shadow-[0_4px_20px_-4px_rgba(3,169,244,0.15)]">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              autosize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask EnGenie..."
            disabled={loading}
            className="flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-engenius-dark outline-none placeholder:text-engenius-gray/60 disabled:opacity-50"
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

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="mb-4 flex justify-end">
        <div className="max-w-[85%] rounded-[20px] rounded-br-md bg-engenius-blue/[0.08] px-4 py-2.5 text-[15px] leading-relaxed text-engenius-dark">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 flex gap-3">
      <div className="flex-shrink-0 pt-0.5">
        <EngenieMark size={22} />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <div className="prose prose-sm max-w-none text-[15px] leading-relaxed text-engenius-dark prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:font-semibold prose-headings:text-engenius-dark prose-strong:text-engenius-dark prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:text-[13px]">
          {message.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {stripCitations(message.content)}
            </ReactMarkdown>
          ) : message.isStreaming ? (
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-engenius-blue/40" />
          ) : null}
        </div>
        {message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dedupe(message.sources).slice(0, 4).map((s, i) => (
              <SourceChip key={i} source={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function stripCitations(text: string): string {
  // Remove [1], [1,2] inline citation markers for cleaner demo display
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
    <span className="inline-flex max-w-[180px] items-center gap-1 rounded-full border border-border/60 bg-white px-2.5 py-1 text-[11px] text-engenius-gray transition-colors hover:border-engenius-blue/40 hover:text-engenius-dark">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
