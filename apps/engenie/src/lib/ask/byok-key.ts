/**
 * What a BYOK key has to be.
 *
 * Since the move to OpenRouter (2026-08) every chat completion — BYOK ones
 * included — is a call to openrouter.ai (@eg/llm streamComplete), so a
 * workspace's key or a visitor's own key must be an OpenRouter key. The
 * screens kept asking for a "google key" / "google API key"; a Google key
 * pasted there reached OpenRouter as a bearer token and came back 401. One
 * OpenRouter key works for every model in the catalog.
 *
 * Pure — used by the admin editor, the visitor's key field, and both routes
 * that accept a key, so all four agree on what is valid.
 */

export const OPENROUTER_KEY_HINT = "sk-or-…";

export const OPENROUTER_KEY_ERROR = "請輸入 OpenRouter API key（sk-or- 開頭）——一把 key 就能用所有模型。";

const OPENROUTER_KEY_RE = /^sk-or-[A-Za-z0-9_-]{16,}$/;

export function isOpenRouterKey(key: string | null | undefined): boolean {
  return !!key && OPENROUTER_KEY_RE.test(key.trim());
}
