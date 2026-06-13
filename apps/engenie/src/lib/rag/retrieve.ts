/**
 * Shared RAG retrieval core.
 *
 * Single source of truth for "question → ranked, scoped document chunks",
 * used by BOTH the human-facing chat (`/api/ask`) and the machine-facing
 * Search API (`/api/v1/search`). Keeping one implementation avoids the two
 * surfaces drifting apart (same reasoning as the shared chat engine).
 *
 * Pipeline: embed query → match_documents (pgvector) → taxonomy filter →
 * cross-lingual literal-match supplements (model / country) → re-rank →
 * (optional strict scope enforcement) → trim.
 */

import { createAdminClient } from "@eg/db/admin";
import { generateEmbedding } from "./embeddings";
import { matchesTaxonomyFilter, extractTaxonomy, type TaxonomyMeta } from "./taxonomy";

export interface RetrievedDoc {
  id: string;
  source_type: string;
  source_id: string;
  source_url: string | null;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface RetrieveOptions {
  question: string;
  history?: { role: string; content: string }[];
  /** Single source_type filter applied at the RPC level (chat UI dropdown). */
  sourceType?: string | null;
  /** Allow-list of source_types enforced app-level (API-key scope). */
  sourceTypes?: string[] | null;
  /** Legacy product_line metadata filter (RPC-level). */
  productLine?: string | null;
  /** Unified taxonomy scope (solution / product_lines / models). */
  taxonomy?: Partial<TaxonomyMeta> | null;
  /** Final number of chunks to return (default 12). */
  finalLimit?: number;
  /** match_documents similarity floor (default 0.3). */
  matchThreshold?: number;
  /**
   * When true, re-apply taxonomy + sourceTypes filters at the VERY END so the
   * cross-lingual supplements can never leak chunks outside the scope. Used by
   * the API (airtight per-key scope); chat leaves it false to preserve the
   * existing behaviour where literal model matches can override the filter.
   */
  strictScope?: boolean;
  /**
   * Workspace mode: knowledge-kind solutions (department SOPs, onboarding,
   * platform how-to) are PRIVATE by default. When this is defined, any doc whose
   * solution is a `kind='knowledge'` area is dropped UNLESS its slug is in this
   * allow-list. `undefined` = not workspace mode → no exclusion (internal Ask /
   * Search API see everything). An empty array = exclude ALL knowledge areas.
   */
  knowledgeAreasAllowed?: string[] | null;
}

const MODEL_MENTION_RE =
  /\b(E[CWS][CWS]?\d{2,4}[A-Z]?|EVS\d{2,4}[A-Z]?|ESG\d{2,4}[A-Z]?|EOC\d{2,4}[A-Z]?|EAP\d{2,4}[A-Z]?|ECP\d{2,4}[A-Z]?)\b/gi;

const COUNTRY_ALIASES: Record<string, string[]> = {
  TW: ["Taiwan", "台灣", "台湾", "TW"],
  JP: ["Japan", "日本", "JP"],
  US: ["USA", "United States", "America", "美國", "美国", "US"],
  GB: ["UK", "United Kingdom", "Britain", "英國", "英国", "GB"],
  DE: ["Germany", "德國", "德国", "DE"],
  FR: ["France", "法國", "法国", "FR"],
  CN: ["China", "中國", "中国", "PRC", "CN"],
  HK: ["Hong Kong", "香港", "HK"],
  SG: ["Singapore", "新加坡", "SG"],
  MY: ["Malaysia", "馬來西亞", "马来西亚", "MY"],
  TH: ["Thailand", "泰國", "泰国", "TH"],
  ID: ["Indonesia", "印尼", "ID"],
  PH: ["Philippines", "菲律賓", "菲律宾", "PH"],
  VN: ["Vietnam", "越南", "VN"],
  KR: ["Korea", "South Korea", "韓國", "韩国", "KR"],
  IN: ["India", "印度", "IN"],
  AU: ["Australia", "澳洲", "澳大利亞", "澳大利亚", "AU"],
  CA: ["Canada", "加拿大", "CA"],
  MX: ["Mexico", "墨西哥", "MX"],
  BR: ["Brazil", "巴西", "BR"],
};

function detectCountries(question: string): string[] {
  const found: string[] = [];
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    for (const alias of aliases) {
      const isCjk = /[一-鿿]/.test(alias);
      const regex = isCjk
        ? new RegExp(alias, "i")
        : new RegExp(`\\b${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
      if (regex.test(question)) {
        found.push(code);
        break;
      }
    }
  }
  return found;
}

interface RawDoc extends Omit<RetrievedDoc, "similarity" | "metadata"> {
  metadata: Record<string, unknown> | null;
}

// kind='knowledge' solution slugs change rarely; cache them in-process so the
// scope resolver doesn't hit the DB on every workspace/API request.
let knowledgeSlugCache: { slugs: Set<string>; at: number } | null = null;
const KNOWLEDGE_SLUG_TTL_MS = 60_000;

async function getKnowledgeSlugs(supabase: ReturnType<typeof createAdminClient>): Promise<Set<string>> {
  const now = Date.now();
  if (knowledgeSlugCache && now - knowledgeSlugCache.at < KNOWLEDGE_SLUG_TTL_MS) {
    return knowledgeSlugCache.slugs;
  }
  const { data } = (await supabase
    .from("solutions" as "products")
    .select("slug")
    .eq("kind", "knowledge")) as { data: { slug: string }[] | null };
  const slugs = new Set((data ?? []).map((r) => r.slug));
  knowledgeSlugCache = { slugs, at: now };
  return slugs;
}

export async function retrieveDocuments(opts: RetrieveOptions): Promise<RetrievedDoc[]> {
  const {
    question,
    history = [],
    sourceType = null,
    sourceTypes = null,
    productLine = null,
    taxonomy = null,
    finalLimit = 12,
    // text-embedding-3-small scores CJK-query↔EN-chunk pairs low (~0.15–0.3),
    // so keep the floor low and lean on finalLimit + re-rank for precision.
    matchThreshold = 0.2,
    strictScope = false,
    knowledgeAreasAllowed = null,
  } = opts;

  const hasTaxonomyFilter = !!(
    taxonomy &&
    (taxonomy.solution ||
      (taxonomy.product_lines && taxonomy.product_lines.length > 0) ||
      (taxonomy.models && taxonomy.models.length > 0))
  );
  const allowTypes = sourceTypes && sourceTypes.length > 0 ? new Set(sourceTypes) : null;

  const mentionedModels = [...new Set((question.match(MODEL_MENTION_RE) ?? []).map((m) => m.toUpperCase()))];
  const hasModelMention = mentionedModels.length > 0;
  const mentionedCountries = detectCountries(question);
  const hasCountryMention = mentionedCountries.length > 0;

  // Wider candidate pool when we'll filter/re-rank afterwards.
  const matchCount = hasTaxonomyFilter || hasModelMention || hasCountryMention || allowTypes ? 40 : Math.max(finalLimit, 12);

  const supabase = createAdminClient();

  // Build the embedding query from recent history + the new question.
  const recentHistory = history.slice(-20);
  const searchQuery =
    recentHistory.length > 0
      ? `${recentHistory.map((m) => m.content).join("\n")}\n${question}`
      : question;
  const queryEmbedding = await generateEmbedding(
    searchQuery.length > 8000 ? searchQuery.slice(-8000) : searchQuery,
  );

  const filterMetadata = productLine ? JSON.stringify({ product_line: productLine }) : null;

  const { data: matches, error } = (await supabase.rpc("match_documents", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: matchCount,
    match_threshold: matchThreshold,
    filter_source_type: sourceType || null,
    filter_metadata: filterMetadata,
  })) as { data: RetrievedDoc[] | null; error: unknown };

  if (error) throw new Error(`Vector search failed: ${String(error)}`);

  let docs: RetrievedDoc[] = (matches ?? []).map((d) => ({ ...d, metadata: d.metadata ?? {} }));

  // Unified scope resolver. A doc is in scope if EITHER:
  //  - it's a knowledge-area doc (solution ∈ kind='knowledge') AND that area is
  //    in the caller's allow-list — gated SOLELY by the allow-list, bypassing the
  //    product taxonomy (so "Cloud AP products + marketing area" works); OR
  //  - it's a product/global doc that matches the product taxonomy filter.
  // `knowledgeAreasAllowed` defined (workspace / Search API) ⇒ scoped mode:
  // knowledge areas are private unless allow-listed (empty array = none).
  // `null` (internal Ask) ⇒ not scoped: areas pass via the taxonomy path as before.
  const scoped = knowledgeAreasAllowed != null;
  const knowledgeSlugs = scoped ? await getKnowledgeSlugs(supabase) : null;
  const inScope = (meta: Partial<TaxonomyMeta>): boolean => {
    const sol = meta.solution ?? null;
    if (scoped && knowledgeSlugs && sol && knowledgeSlugs.has(sol)) {
      return knowledgeAreasAllowed!.includes(sol);
    }
    return hasTaxonomyFilter && taxonomy ? matchesTaxonomyFilter(meta, taxonomy) : true;
  };
  if (hasTaxonomyFilter || scoped) {
    docs = docs.filter((d) => inScope(extractTaxonomy(d.metadata)));
  }

  // Cross-lingual literal-match supplements + unified re-rank.
  if (hasModelMention || hasCountryMention) {
    const existingIds = new Set(docs.map((d) => d.id));
    const addUnique = (rows: RawDoc[] | null) => {
      if (!rows) return;
      for (const r of rows) {
        if (!existingIds.has(r.id)) {
          docs.push({ ...r, metadata: r.metadata ?? {}, similarity: 0 });
          existingIds.add(r.id);
        }
      }
    };

    if (hasModelMention) {
      for (const m of mentionedModels) {
        const { data: focused } = (await supabase
          .from("documents" as "products")
          .select("id, source_type, source_id, source_url, title, content, metadata")
          .gte("chunk_index", 10000)
          .or(`content.ilike.%${m}%,title.ilike.%${m}%,source_id.ilike.%${m.toLowerCase()}%`)
          .limit(10)) as { data: RawDoc[] | null };
        addUnique(focused);
      }
      const orClauses = mentionedModels
        .map((m) => `content.ilike.%${m}%,title.ilike.%${m}%,source_id.ilike.%${m.toLowerCase()}%`)
        .join(",");
      const { data: modelMatches } = (await supabase
        .from("documents" as "products")
        .select("id, source_type, source_id, source_url, title, content, metadata")
        .or(orClauses)
        .limit(30)) as { data: RawDoc[] | null };
      addUnique(modelMatches);
    }

    if (hasCountryMention) {
      for (const code of mentionedCountries) {
        const { data: countryChunks } = (await supabase
          .from("documents" as "products")
          .select("id, source_type, source_id, source_url, title, content, metadata")
          .eq("source_type", "wifi_regulation")
          .eq("source_id", code)
          .limit(3)) as { data: RawDoc[] | null };
        addUnique(countryChunks);
      }
    }

    const scored = docs.map((d) => {
      const haystack = `${d.source_id} ${d.title} ${d.content}`.toUpperCase();
      const modelMatches = hasModelMention ? mentionedModels.filter((m) => haystack.includes(m)).length : 0;
      const isFocusedLed = (d.metadata?.chunk_type as string) === "focused_led_table" ? 1 : 0;
      const countryMatch =
        hasCountryMention &&
        d.source_type === "wifi_regulation" &&
        mentionedCountries.includes((d.source_id || "").toUpperCase())
          ? 1
          : 0;
      return { doc: d, score: modelMatches * 10 + isFocusedLed * 5 + countryMatch * 20 + d.similarity };
    });
    scored.sort((a, b) => b.score - a.score);
    docs = scored.map((s) => s.doc);
  }

  // Airtight scope: re-apply taxonomy + source-type allow-list at the very end
  // so supplements can never leak out-of-scope chunks (API path only).
  // Airtight scope: re-apply the same resolver + source-type allow-list at the
  // very end so the cross-lingual supplements can never leak out-of-scope chunks.
  if (strictScope) {
    if (hasTaxonomyFilter || scoped) {
      docs = docs.filter((d) => inScope(extractTaxonomy(d.metadata)));
    }
    if (allowTypes) {
      docs = docs.filter((d) => allowTypes.has(d.source_type));
    }
  } else if (allowTypes) {
    docs = docs.filter((d) => allowTypes.has(d.source_type));
  }

  return docs.slice(0, finalLimit);
}
