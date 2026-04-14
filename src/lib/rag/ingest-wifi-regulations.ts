/**
 * WiFi Regulations Ingestion Pipeline
 *
 * Pulls per-country WiFi regulation data from the EnGenius WiFi RegHub API
 * and indexes one chunk per country into the RAG knowledge base. The API
 * already returns well-structured markdown via /countries/{code}/text, so
 * we use that directly as the chunk content — no extra formatting needed.
 *
 * Regulations apply across all wireless products (Cloud AP, Fit AP,
 * Broadband Outdoor APs, etc.) so we default the taxonomy to:
 *   solution: null       (global — applies to any solution with wireless)
 *   product_lines: []
 *   models: []
 *
 * API docs: https://wifi-reghub.vercel.app/docs/wifi-regs-api.html
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";
import { getApiKey, API_KEY_MAP } from "@/lib/settings";
import { normalizeTaxonomy, type TaxonomyMeta } from "./taxonomy";

const API_BASE = "https://wifi-reghub.vercel.app/api/wifi-regs/v1";
const EMBED_BATCH_SIZE = 20;
const MAX_EMBED_CHARS = 21000;
const MIN_CHUNK_CHARS = 80;

export interface IngestWifiRegulationsOptions {
  /** Force re-embed even if unchanged */
  force?: boolean;
  /** Optional list of country codes to restrict the ingest to */
  countryCodes?: string[];
  /** Taxonomy metadata — defaults to global (null solution) */
  taxonomy?: Partial<TaxonomyMeta>;
}

export interface IngestWifiRegulationsResult {
  processed: number;
  skipped: number;
  countries_fetched: number;
  countries_skipped: number;
  errors: string[];
}

interface CountryListItem {
  code: string;
  name: string;
  last_updated: string;
}

interface CountryListResponse {
  total: number;
  countries: CountryListItem[];
}

async function getRegHubKey(): Promise<string> {
  const key = await getApiKey("wifi_reghub_api_key", API_KEY_MAP.wifi_reghub_api_key);
  if (!key) {
    throw new Error(
      "WiFi RegHub API key not configured. Set wifi_reghub_api_key in Settings or WIFI_REGHUB_API_KEY env var."
    );
  }
  return key;
}

async function fetchCountries(apiKey: string): Promise<CountryListItem[]> {
  const res = await fetch(`${API_BASE}/countries`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to list countries: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as CountryListResponse;
  return data.countries ?? [];
}

async function fetchCountryMarkdown(apiKey: string, code: string): Promise<string> {
  const res = await fetch(`${API_BASE}/countries/${code}/text`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${code}: ${res.status}`);
  }
  return res.text();
}

export async function ingestWifiRegulations(
  options: IngestWifiRegulationsOptions = {}
): Promise<IngestWifiRegulationsResult> {
  const { force = false, countryCodes, taxonomy } = options;
  const errors: string[] = [];
  const tax = normalizeTaxonomy(taxonomy);

  // Step 1: Get API key + country list
  const apiKey = await getRegHubKey();
  const allCountries = await fetchCountries(apiKey);

  const targetCountries = countryCodes && countryCodes.length > 0
    ? allCountries.filter((c) => countryCodes.includes(c.code.toUpperCase()))
    : allCountries;

  if (targetCountries.length === 0) {
    return {
      processed: 0,
      skipped: 0,
      countries_fetched: 0,
      countries_skipped: 0,
      errors: ["No countries to ingest"],
    };
  }

  // Step 2: Fetch existing hashes for change detection
  const supabase = createAdminClient();
  const { data: existingDocs } = await supabase
    .from("documents" as "products")
    .select("source_id, chunk_index, content_hash")
    .eq("source_type", "wifi_regulation") as {
    data: { source_id: string; chunk_index: number; content_hash: string }[] | null;
  };

  const hashMap = new Map<string, string>();
  for (const doc of existingDocs ?? []) {
    hashMap.set(`${doc.source_id}:${doc.chunk_index}`, doc.content_hash);
  }

  // Step 3: Fetch markdown per country in small concurrent batches
  const CONCURRENCY = 5;
  const allChunks: {
    sourceId: string;
    sourceUrl: string;
    chunkIndex: number;
    content: string;
    title: string;
    hash: string;
    metadata: Record<string, unknown>;
  }[] = [];
  let countriesFetched = 0;
  let countriesSkipped = 0;
  let skipped = 0;

  for (let i = 0; i < targetCountries.length; i += CONCURRENCY) {
    const batch = targetCountries.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (country) => {
        const md = await fetchCountryMarkdown(apiKey, country.code);
        return { country, md };
      })
    );

    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(String(r.reason));
        continue;
      }
      const { country, md } = r.value;
      if (!md || md.trim().length < MIN_CHUNK_CHARS) {
        countriesSkipped++;
        continue;
      }
      countriesFetched++;

      const cleanContent = md.trim();
      const sourceId = country.code.toUpperCase();
      // Point citations at our own internal page (which renders the markdown
      // nicely with auth handled server-side). The upstream API endpoint
      // requires a Bearer token so it can't be opened directly from the
      // browser.
      const sourceUrl = `/wifi-regulation/${sourceId}`;
      const title = `${country.name} (${country.code}) — WiFi Regulation`;
      const chunkIndex = 0;
      const hash = contentHash(cleanContent);

      if (!force && hashMap.get(`${sourceId}:${chunkIndex}`) === hash) {
        skipped++;
        continue;
      }

      allChunks.push({
        sourceId,
        sourceUrl,
        chunkIndex,
        content: cleanContent,
        title,
        hash,
        metadata: {
          country_code: country.code,
          country_name: country.name,
          last_updated: country.last_updated,
          reghub_label: "WiFi Regulations",
          solution: tax.solution,
          product_lines: tax.product_lines,
          models: tax.models,
        },
      });
    }
  }

  if (allChunks.length === 0) {
    return {
      processed: 0,
      skipped,
      countries_fetched: countriesFetched,
      countries_skipped: countriesSkipped,
      errors,
    };
  }

  // Step 4: Embed + upsert
  let processed = 0;
  for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((c) =>
      c.content.length > MAX_EMBED_CHARS ? c.content.slice(0, MAX_EMBED_CHARS) : c.content
    );

    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddings(texts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Embedding batch ${i / EMBED_BATCH_SIZE + 1} failed: ${msg}`);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = embeddings[j];

      const { error: upsertError } = await supabase
        .from("documents" as "products")
        .upsert(
          {
            source_type: "wifi_regulation",
            source_id: chunk.sourceId,
            source_url: chunk.sourceUrl,
            title: chunk.title,
            chunk_index: chunk.chunkIndex,
            content: chunk.content,
            token_count: estimateTokens(chunk.content),
            metadata: chunk.metadata,
            embedding: `[${embedding.join(",")}]`,
            content_hash: chunk.hash,
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>,
          { onConflict: "source_type,source_id,chunk_index" }
        );

      if (upsertError) {
        errors.push(`Upsert ${chunk.sourceId}: ${JSON.stringify(upsertError)}`);
      } else {
        processed++;
      }
    }
  }

  return {
    processed,
    skipped,
    countries_fetched: countriesFetched,
    countries_skipped: countriesSkipped,
    errors,
  };
}
