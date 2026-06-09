import type { ChatMessage } from "@/hooks/use-chat-stream";

/**
 * Per-browser conversation history for the EnGenie demo. Stored in
 * localStorage (NOT the server) because demo users are anonymous — a shared
 * server history would mix everyone's conversations together.
 */

const KEY = "engenie_history_v1";
const MAX = 30;

export interface DemoConversation {
  id: string;
  title: string;
  updatedAt: number;
  provider: string;
  persona: string;
  profile: string;
  messages: ChatMessage[];
}

function read(): DemoConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as DemoConversation[]) : [];
  } catch {
    return [];
  }
}

function write(list: DemoConversation[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function listConversations(): DemoConversation[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertConversation(c: DemoConversation) {
  const list = read().filter((x) => x.id !== c.id);
  list.unshift(c);
  write(list);
}

export function deleteConversation(id: string) {
  write(read().filter((x) => x.id !== id));
}

export function newConversationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
  }
}
