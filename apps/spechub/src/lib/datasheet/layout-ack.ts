/**
 * Per-locale layout-overflow acknowledgement helpers.
 *
 * The ack lives in `products.layout_ack` JSONB, keyed by locale. Two
 * formats are supported for backward compat:
 *
 *   - Legacy:  `true` → means "always ack", no content binding
 *   - New:     `{ acked: true, hash: "<sha256-hex>" }` → only valid
 *              while the content hash matches. When the overview /
 *              features for that locale change, `hash` no longer
 *              matches and the ack silently falls back to "not acked"
 *              so the warning re-appears.
 *
 * The hash is a stable fingerprint of the relevant rendered content
 * (overview + features, joined deterministically). Specs are not
 * included because spec overflow is content-agnostic (rendered via
 * pagination, not per-locale text wrapping).
 */
import { createHash } from "node:crypto";

export type LayoutAckValue = true | { acked: true; hash: string };

export type LayoutAckMap = Record<string, LayoutAckValue | undefined>;

/**
 * Deterministic content fingerprint for a locale's renderable text.
 * Trims whitespace so minor whitespace-only edits don't invalidate.
 */
export function computeContentHash(
  overview: string | null | undefined,
  features: string[] | null | undefined,
): string {
  const ov = (overview ?? "").trim();
  const ft = (features ?? []).map((f) => f.trim()).join("\n");
  return createHash("sha256").update(`${ov}\n---\n${ft}`).digest("hex").slice(0, 16);
}

/**
 * True when an ack exists and is still valid for the given content.
 *
 * - Legacy `true` → always valid (backward compat with pre-hash acks)
 * - `{acked, hash}` → valid only when hash matches current content
 * - undefined / false / anything else → not acked
 */
export function isAckValid(
  ack: LayoutAckValue | undefined,
  currentHash: string,
): boolean {
  if (ack === true) return true;
  if (ack && typeof ack === "object" && ack.acked === true) {
    return ack.hash === currentHash;
  }
  return false;
}

/**
 * True when an ack entry exists but has gone stale (hash mismatch).
 * Caller can show a "this was previously acked but content changed"
 * hint, or just ignore it.
 */
export function isAckStale(
  ack: LayoutAckValue | undefined,
  currentHash: string,
): boolean {
  if (ack && typeof ack === "object" && ack.acked === true) {
    return ack.hash !== currentHash;
  }
  return false;
}
