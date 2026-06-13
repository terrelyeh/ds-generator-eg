import type { ChatMessage } from "@/hooks/use-chat-stream";

/**
 * Per-browser conversation history for the EnGenie demo + Ask workspaces.
 * Stored in localStorage (NOT the server) because these users are anonymous —
 * a shared server history would mix everyone's conversations together.
 *
 * History is partitioned by workspace slug: each /ask/<slug> entry keeps its
 * own bucket, and the public /demo/ask (no slug) keeps the original bucket.
 * This stops different departments on a shared device from seeing each other's
 * conversations. NOTE: it is still per-browser — incognito keeps it until all
 * incognito windows close; it is NOT synced to the server.
 */

const BASE_KEY = "engenie_history_v1";
const MAX = 30;

/** localStorage key for a workspace (undefined = the public /demo/ask bucket). */
function keyFor(workspace?: string): string {
  return workspace ? `${BASE_KEY}_${workspace}` : BASE_KEY;
}

export interface DemoConversation {
  id: string;
  title: string;
  updatedAt: number;
  provider: string;
  persona: string;
  profile: string;
  messages: ChatMessage[];
}

function read(workspace?: string): DemoConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(workspace));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as DemoConversation[]) : [];
  } catch {
    return [];
  }
}

function write(list: DemoConversation[], workspace?: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(workspace), JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function listConversations(workspace?: string): DemoConversation[] {
  return read(workspace).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertConversation(c: DemoConversation, workspace?: string) {
  const list = read(workspace).filter((x) => x.id !== c.id);
  list.unshift(c);
  write(list, workspace);
}

export function deleteConversation(id: string, workspace?: string) {
  write(read(workspace).filter((x) => x.id !== id), workspace);
}

export function newConversationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
  }
}
