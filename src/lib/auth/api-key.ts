/**
 * External API key auth for the RAG Search API (other departments' apps).
 *
 * Keys are `sk_live_…`; only the SHA-256 hash is stored (plaintext shown once
 * at creation). `verifyApiKey` does verify + enable check + fixed-window rate
 * limit + usage bump in a single atomic RPC (`api_key_touch`).
 *
 * Scope is the per-key CEILING, enforced server-side: a request may NARROW it
 * but never broaden it (see `effectiveScope`).
 */

import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TaxonomyMeta } from "@/lib/rag/taxonomy";

export interface ApiKeyScope {
  /** null/absent = all solutions. */
  solution?: string | null;
  /** empty = all lines within the solution. */
  product_lines?: string[];
  /** empty = all models. */
  models?: string[];
  /** empty = all source types. */
  source_types?: string[];
}

export interface VerifiedKey {
  id: string;
  name: string;
  scope: ApiKeyScope;
  rate_limit_per_min: number;
}

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Generate a new key: plaintext (shown once), display prefix, and stored hash. */
export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const random = randomBytes(24).toString("base64url"); // url-safe, ~32 chars
  const plaintext = `sk_live_${random}`;
  return { plaintext, prefix: plaintext.slice(0, 16), hash: hashKey(plaintext) };
}

export interface ApiKeyAuthResult {
  ok: boolean;
  status: number;
  key?: VerifiedKey;
  error?: string;
}

interface TouchRow {
  id: string;
  name: string;
  scope: ApiKeyScope | null;
  enabled: boolean;
  rate_limit_per_min: number;
  allowed: boolean;
}

/**
 * Verify the `Authorization: Bearer sk_…` header, enforce enabled + per-minute
 * rate limit, and bump usage counters. Returns a structured result with the
 * right HTTP status so the route can reply with clean JSON (never an HTML
 * redirect — API clients need machine-readable errors).
 */
export async function verifyApiKey(request: Request): Promise<ApiKeyAuthResult> {
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, status: 401, error: "Missing 'Authorization: Bearer <key>' header" };

  const plaintext = m[1].trim();
  if (!plaintext.startsWith("sk_")) return { ok: false, status: 401, error: "Invalid API key format" };

  const supabase = createAdminClient();
  const { data, error } = (await supabase.rpc("api_key_touch", { p_hash: hashKey(plaintext) })) as {
    data: TouchRow[] | null;
    error: unknown;
  };
  if (error) return { ok: false, status: 500, error: "Auth check failed" };

  const row = data?.[0];
  if (!row) return { ok: false, status: 401, error: "Invalid API key" };
  if (!row.enabled) return { ok: false, status: 403, error: "API key disabled" };
  if (!row.allowed) return { ok: false, status: 429, error: "Rate limit exceeded — try again shortly" };

  return {
    ok: true,
    status: 200,
    key: { id: row.id, name: row.name, scope: row.scope || {}, rate_limit_per_min: row.rate_limit_per_min },
  };
}

/**
 * Intersect a request's requested scope with the key's ceiling. The request can
 * only NARROW within what the key allows; anything broader (or entirely outside
 * the ceiling) is ignored so the key's restriction always holds.
 */
export function effectiveScope(
  keyScope: ApiKeyScope,
  req: { taxonomy?: Partial<TaxonomyMeta> | null; source_types?: string[] | null },
): { taxonomy: Partial<TaxonomyMeta>; sourceTypes: string[] | null } {
  const ks = keyScope || {};
  const reqTax = req.taxonomy || {};

  // Solution: if the key pins a solution, the request can't change it.
  const solution = ks.solution ?? reqTax.solution ?? null;

  // Narrow a list within a ceiling. If the request picks entirely outside the
  // ceiling (empty intersection), fall back to the ceiling — never widen, and
  // never collapse to "empty = all" which would escape the restriction.
  const narrow = (ceiling?: string[], requested?: string[] | null): string[] => {
    const c = ceiling && ceiling.length ? ceiling : null;
    const r = requested && requested.length ? requested : null;
    if (c && r) {
      const inter = r.filter((x) => c.includes(x));
      return inter.length ? inter : c;
    }
    return c ?? r ?? [];
  };

  const product_lines = narrow(ks.product_lines, reqTax.product_lines);
  const models = narrow(ks.models, reqTax.models);

  const stCeiling = ks.source_types && ks.source_types.length ? ks.source_types : null;
  const stReq = req.source_types && req.source_types.length ? req.source_types : null;
  let sourceTypes: string[] | null;
  if (stCeiling && stReq) {
    const inter = stReq.filter((x) => stCeiling.includes(x));
    sourceTypes = inter.length ? inter : stCeiling;
  } else {
    sourceTypes = stCeiling ?? stReq ?? null;
  }

  return { taxonomy: { solution, product_lines, models }, sourceTypes };
}
