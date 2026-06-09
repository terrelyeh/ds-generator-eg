"use client";

import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { EngenieMark } from "./engenie-mark";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { ChatPre } from "@/components/chat/chat-pre";
import {
  useChatStream,
  type ChatMessage as Message,
  type ChatSource as Source,
} from "@/hooks/use-chat-stream";
import { upsertConversation, newConversationId } from "@/lib/demo/history";

const markdownComponents: Components = {
  // Tables fit the container width (no horizontal scrollbar) and wrap inside
  // cells — table-fixed gives even columns, break-words wraps long content.
  table: ({ children }) => (
    <div className="my-5 w-full">
      <table className="w-full table-fixed border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="whitespace-normal break-words align-top">{children}</th>
  ),
  td: ({ children }) => (
    <td className="whitespace-normal break-words align-top">{children}</td>
  ),
  // Fenced blocks → CodeBlock, except ```topology → TopologyDiagram
  pre: ({ children }) => <ChatPre>{children}</ChatPre>,
};

export interface EngenieChatProps {
  provider: string;
  persona: string;
  profile: string;
  welcomeSubtitle?: string | null;
  welcomeDescription?: string | null;
  exampleQuestions?: string[];
  /** Labels for the bottom status bar (shows current model/persona/profile). */
  modelLabel?: string;
  personaLabel?: string;
  profileLabel?: string;
  /** Open the settings drawer (status bar is tappable so users can switch). */
  onOpenSettings?: () => void;
  /** Seed messages when resuming a saved conversation from history. */
  initialMessages?: Message[];
  initialConvId?: string | null;
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
  modelLabel,
  personaLabel,
  profileLabel,
  onOpenSettings,
  initialMessages,
  initialConvId,
}: EngenieChatProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const convIdRef = useRef<string | null>(initialConvId ?? null);

  // Shared chat streaming engine — same logic as the desktop Ask panel.
  // Live status ("searching" → "generating") drives 搜尋相關資料中… / 整理回覆中…
  const { messages, setMessages, loading, loadingStatus, submit, stop, regenerate } = useChatStream({
    getParams: () => ({ provider, persona, profile }),
    stoppedLabel: "_(已停止)_",
    onComplete: (msgs) => {
      // Persist this turn to per-browser history (localStorage).
      const firstUser = msgs.find((m) => m.role === "user");
      if (!firstUser) return;
      if (!convIdRef.current) convIdRef.current = newConversationId();
      upsertConversation({
        id: convIdRef.current,
        title: firstUser.content.slice(0, 60),
        updatedAt: Date.now(),
        provider,
        persona,
        profile,
        messages: msgs,
      });
    },
  });

  const { ref: scrollRef, isAtBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>([messages, loading]);

  // Seed a resumed conversation (from history) once on mount.
  useEffect(() => {
    if (initialMessages && initialMessages.length) setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Submit from the input box / example chips. Streaming lives in
  // useChatStream; this only manages the textarea (clear + autosize).
  function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    requestAnimationFrame(autosize);
    submit(q);
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
          <div className="mx-auto w-full max-w-[864px] px-5 pt-6 pb-8">
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
                  onFollowUp={isLastAssistant ? submit : undefined}
                  onRegenerate={isLastAssistant && !loading ? regenerate : undefined}
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
        <div className="mx-auto flex w-full max-w-[864px] items-end gap-2 rounded-[28px] border border-black/[0.08] bg-white px-4 py-2 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] transition-all focus-within:border-engenius-blue/50 focus-within:shadow-[0_4px_20px_-4px_rgba(3,169,244,0.15)]">
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
              onClick={stop}
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
        {(modelLabel || personaLabel || profileLabel) && (
          <button
            onClick={onOpenSettings}
            title="點此切換 模型 / 角色 / 對象"
            className="mx-auto mt-2 flex max-w-[864px] flex-wrap items-center justify-center gap-x-1.5 px-2 text-[11px] text-engenius-dark/45 transition-colors hover:text-engenius-dark/75"
          >
            {modelLabel && <span>{modelLabel}</span>}
            {personaLabel && (<><span className="opacity-50">·</span><span>角色：{personaLabel}</span></>)}
            {profileLabel && (<><span className="opacity-50">·</span><span>對象：{profileLabel}</span></>)}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5 opacity-60"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        )}
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
        <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-engenius-blue/[0.09] px-4 py-3 text-[15px] leading-[1.6] text-engenius-dark">
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
            className={`prose max-w-none text-[15px] text-engenius-dark
              prose-p:my-5 prose-p:leading-[1.75]
              prose-headings:mb-3.5 prose-headings:font-semibold prose-headings:text-engenius-dark prose-headings:tracking-tight
              prose-h1:mt-9 prose-h1:text-[21px]
              prose-h2:mt-8 prose-h2:text-[18px]
              prose-h3:mt-6 prose-h3:text-[16px]
              prose-strong:font-semibold prose-strong:text-engenius-dark
              prose-ul:my-5 prose-ul:pl-5 prose-ol:my-5 prose-ol:pl-5 prose-li:my-2 prose-li:leading-[1.7] prose-li:marker:text-engenius-dark/40
              prose-code:rounded prose-code:bg-black/[0.05] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-black/[0.04] prose-pre:text-[13px] prose-pre:border prose-pre:border-black/[0.06]
              prose-blockquote:border-l-2 prose-blockquote:border-engenius-blue/40 prose-blockquote:pl-4 prose-blockquote:text-engenius-dark/80 prose-blockquote:font-normal prose-blockquote:not-italic
              prose-hr:my-7 prose-hr:border-black/[0.08]
              prose-table:text-[13.5px] prose-th:bg-black/[0.03] prose-th:py-2.5 prose-th:px-3 prose-td:py-2.5 prose-td:px-3 prose-td:align-top
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
    <div className="relative inline-flex items-center justify-center" style={{ width: 22, height: 22 }}>
      {thinking && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(3,169,244,0.45), transparent 68%)",
            animation: "engenieGlow 1.5s ease-in-out infinite",
          }}
        />
      )}
      <span
        style={{
          display: "inline-block",
          transformOrigin: "center",
          animation: thinking ? "engenieBreath 1.5s ease-in-out infinite" : undefined,
        }}
      >
        <EngenieMark size={20} />
      </span>
      <style>{`
        @keyframes engenieBreath {
          0%, 100% { transform: scale(0.82); opacity: 0.7; }
          50% { transform: scale(1.16); opacity: 1; }
        }
        @keyframes engenieGlow {
          0%, 100% { opacity: 0.2; transform: scale(0.75); }
          50% { opacity: 0.75; transform: scale(1.35); }
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
