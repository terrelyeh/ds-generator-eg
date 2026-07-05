import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared SSE streaming engine for both Ask surfaces (desktop panel + EnGenie
 * demo). Owns the message list, loading/status state, rAF-batched streaming,
 * abort (Stop), and regenerate — so there is ONE implementation of the chat
 * core. The surfaces only differ in presentation (typography, citations,
 * brand), which stays in their components.
 *
 * The returned `submit` / `stop` / `regenerate` are referentially stable
 * (safe to pass to memoized message components); they read the latest
 * messages + config via refs.
 */

export interface ChatSource {
  title: string;
  source_id: string;
  source_type: string;
  source_url: string | null;
  similarity: number;
  image_urls?: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  followUps?: string[];
  imageMap?: Record<string, string[]>;
  provider?: string;
  isStreaming?: boolean;
}

export type ChatLoadStatus = "searching" | "generating" | null;

export interface UseChatStreamConfig {
  /**
   * Per-request body fields, read at call time. `provider`/`persona`/`profile`
   * are always sent; any extra keys (e.g. `workspace`, `userKey`, `taxonomy`)
   * are forwarded verbatim into the POST body, so callers can add fields
   * without changing this hook.
   */
  getParams: () => { provider: string; persona: string; profile: string; [key: string]: unknown };
  /** Called with the final message list after a successful (or stopped) turn. */
  onComplete?: (messages: ChatMessage[]) => void;
  /** Text appended to a stopped answer. Defaults to "_(stopped)_". */
  stoppedLabel?: string;
  /** Endpoint, defaults to /api/ask. */
  endpoint?: string;
  /** Workspace bearer (`<slug>.<token>`) for embedded widgets — sent as
   *  `Authorization: Bearer …` since cross-site iframes can't use cookies. */
  authToken?: string;
}

/** Split trailing "--- \n followups" off the answer body. */
export function parseFollowUps(text: string): { answer: string; followUps: string[] } {
  const sepIdx = text.lastIndexOf("\n---\n");
  if (sepIdx === -1) return { answer: text, followUps: [] };
  const answerPart = text.slice(0, sepIdx).replace(/\n+$/, "");
  const after = text.slice(sepIdx + 5).trim();
  const lines = after.split("\n").map((l) => l.trim()).filter(Boolean);
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

export function useChatStream(config: UseChatStreamConfig) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<ChatLoadStatus>(null);

  const pendingContentRef = useRef("");
  const rafIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const configRef = useRef(config);
  configRef.current = config;

  const scheduleFlush = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const content = pendingContentRef.current;
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") updated[updated.length - 1] = { ...last, content };
        return updated;
      });
    });
  }, []);

  // Cancel any pending streaming flush on unmount.
  useEffect(() => () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
  }, []);

  const runAsk = useCallback(async (q: string, base: ChatMessage[]) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const cfg = configRef.current;
    const params = cfg.getParams();
    const { provider } = params;
    const endpoint = cfg.endpoint ?? "/api/ask";
    const stoppedLabel = cfg.stoppedLabel ?? "_(stopped)_";

    setMessages([...base, { role: "assistant", content: "", isStreaming: true }]);
    setLoading(true);
    setLoadingStatus("searching");
    pendingContentRef.current = "";

    const controller = new AbortController();
    abortRef.current = controller;

    let fullContent = "";
    let streamSources: ChatSource[] = [];
    let streamFollowUps: string[] = [];
    let streamImageMap: Record<string, string[]> = {};
    let streamProvider = provider;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.authToken ? { Authorization: `Bearer ${cfg.authToken}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          // ...params carries provider/persona/profile PLUS any caller extras
          // (workspace, userKey, taxonomy, …) — don't hardcode the field list,
          // or workspace-mode requests silently drop their scope/key.
          question: q,
          ...params,
          history: base.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        setMessages([...base, { role: "assistant", content: `Error: Server error (${res.status}). ${errText.slice(0, 200)}` }]);
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
              // Sources arrive right after retrieval, before the LLM stream —
              // commit them to the in-flight assistant bubble immediately so
              // the surface can show what was found while the answer is still
              // generating. (The rAF content flush spreads the previous
              // message, so this field survives subsequent chunk updates.)
              const src = streamSources;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant" && last.isStreaming) {
                  updated[updated.length - 1] = { ...last, sources: src };
                }
                return updated;
              });
            } else if (event.type === "metadata") {
              streamFollowUps = event.follow_ups ?? [];
              streamImageMap = event.image_map ?? {};
              streamProvider = event.provider ?? provider;
            } else if (event.type === "error") {
              // Backend signalled a structured error mid-stream.
              fullContent += (fullContent ? "\n\n" : "") + (event.content || event.message || "（伺服器發生錯誤，請稍後再試）");
            }
          } catch {
            /* skip unparseable */
          }
        }
      }

      // Final flush — cancel any pending rAF; final state committed below.
      if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }

      // Stream finished cleanly but produced nothing (provider returned no text,
      // or the connection closed after only status events) — show a friendly
      // message instead of committing a blank assistant bubble.
      if (!fullContent.trim()) {
        const empty: ChatMessage[] = [...base, { role: "assistant", content: "抱歉，這次沒有收到回覆，請再試一次。", isStreaming: false }];
        setMessages(empty);
        cfg.onComplete?.(empty);
        return;
      }

      const { answer, followUps: parsed } = parseFollowUps(fullContent);
      const finalFollowUps = parsed.length > 0 ? parsed : streamFollowUps;

      const finalMessages: ChatMessage[] = [...base, {
        role: "assistant",
        content: answer,
        sources: streamSources,
        followUps: finalFollowUps,
        imageMap: Object.keys(streamImageMap).length > 0 ? streamImageMap : undefined,
        provider: streamProvider,
        isStreaming: false,
      }];
      setMessages(finalMessages);
      cfg.onComplete?.(finalMessages);
    } catch (err) {
      if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
      if (err instanceof DOMException && err.name === "AbortError") {
        // User hit Stop — keep whatever streamed so far as the final answer.
        const { answer } = parseFollowUps(fullContent);
        const partial = (answer || fullContent).trim();
        const finalMessages: ChatMessage[] = [...base, {
          role: "assistant",
          content: partial ? `${partial}\n\n${stoppedLabel}` : stoppedLabel,
          sources: streamSources,
          provider: streamProvider,
          isStreaming: false,
        }];
        setMessages(finalMessages);
        cfg.onComplete?.(finalMessages);
      } else {
        // Network drop / server crash mid-stream. Keep whatever already streamed
        // (don't make the user lose a half-read answer) and mark the interruption;
        // otherwise show a friendly retryable message rather than a raw TypeError.
        const { answer } = parseFollowUps(fullContent);
        const partial = (answer || fullContent).trim();
        const finalMessages: ChatMessage[] = [...base, {
          role: "assistant",
          content: partial ? `${partial}\n\n_(連線中斷，回覆可能未完成)_` : "連線中斷，請再試一次。",
          sources: streamSources,
          provider: streamProvider,
          isStreaming: false,
        }];
        setMessages(finalMessages);
        cfg.onComplete?.(finalMessages);
      }
    } finally {
      setLoading(false);
      setLoadingStatus(null);
      abortRef.current = null;
      inFlightRef.current = false;
    }
  }, [scheduleFlush]);

  const submit = useCallback(async (q: string) => {
    const text = (q ?? "").trim();
    if (!text) return;
    await runAsk(text, [...messagesRef.current, { role: "user", content: text }]);
  }, [runAsk]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(async () => {
    const msgs = messagesRef.current;
    let idx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") { idx = i; break; }
    }
    if (idx === -1) return;
    await runAsk(msgs[idx].content, msgs.slice(0, idx + 1));
  }, [runAsk]);

  return { messages, setMessages, loading, loadingStatus, submit, stop, regenerate };
}
