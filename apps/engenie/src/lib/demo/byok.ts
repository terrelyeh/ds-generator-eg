/**
 * Per-browser storage for a user's own LLM API key in a `user_byok` Ask
 * workspace. Kept ONLY in this browser (localStorage), scoped per workspace
 * slug, and sent with each /api/ask request — it is NEVER persisted on the
 * server or written to history.
 *
 * SECURITY NOTE: this is an internal tool. The key lives in localStorage
 * (readable by any script on the origin) and transits our server on its way to
 * the LLM provider. We never log it. Treat it like a password.
 */

const PREFIX = "engenie_byok_key_v1_";

export function getUserKey(workspace?: string): string {
  if (typeof window === "undefined" || !workspace) return "";
  try {
    return window.localStorage.getItem(PREFIX + workspace) ?? "";
  } catch {
    return "";
  }
}

export function setUserKey(workspace: string, key: string) {
  if (typeof window === "undefined" || !workspace) return;
  try {
    window.localStorage.setItem(PREFIX + workspace, key);
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearUserKey(workspace: string) {
  if (typeof window === "undefined" || !workspace) return;
  try {
    window.localStorage.removeItem(PREFIX + workspace);
  } catch {
    /* ignore */
  }
}
