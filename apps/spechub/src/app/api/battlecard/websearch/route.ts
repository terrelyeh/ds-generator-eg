import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { getApiKey } from "@eg/db/settings";

/**
 * POST /api/battlecard/websearch  { competitorProductId }
 *
 * Fill a competitor model's *empty* battlecard cells from a GENERAL WEB SEARCH
 * (not just the official datasheet). One firecrawl search for the model's specs
 * → Claude extracts every still-missing dimension at once → written as
 * LOW-CONFIDENCE drafts, each tagged with the source page it came from.
 *
 * Only empty cells are touched — filled and PM-confirmed cells are never
 * overwritten. Web values are inherently less authoritative than datasheets,
 * so they always land as drafts for a PM to verify (never auto-confirmed).
 *
 * Requires FIRECRAWL_API_KEY (env) + an Anthropic key (app_settings).
 */

const PER_RESULT = 6000;
const MAX_SOURCES = 24000;

interface SearchResult {
  url: string;
  title?: string;
  markdown?: string;
  description?: string;
}

async function webSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      limit: 5,
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });
  if (!res.ok) throw new Error(`firecrawl search ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const data = Array.isArray(json?.data) ? json.data : json?.data?.web ?? [];
  return data as SearchResult[];
}

interface Extracted {
  dimension_key: string;
  value: string;
  found: boolean;
  source_url: string;
}

async function extract(
  missing: { dimension_key: string; label: string; unit: string | null }[],
  sources: string,
  label: string,
  anthropicKey: string
): Promise<Extracted[]> {
  const template = missing
    .map((d) => `${d.dimension_key} | ${d.label}${d.unit ? ` (${d.unit})` : ""}`)
    .join("\n");

  const system =
    "You are a competitor spec researcher. Fill values ONLY from the provided web sources — never guess. " +
    "Prefer manufacturer/spec pages over forums/retailers. Return ONLY a JSON array.";
  const user = `Find these MISSING spec dimensions for "${label}" (machine_key | label):\n${template}\n\nWeb search results (each block starts with its URL):\n${sources}\n\nReturn a JSON array, one object per dimension_key you can fill: {"dimension_key":"...","value":"<concise, comparable, matching unit>","found":true|false,"source_url":"<the result URL the value came from>"}. If a value isn't in the sources, set found=false, value="", source_url="". source_url MUST be one of the result URLs. Use compact notation (e.g. "38 W", "4 × 4:4", "1× 2.5GbE"). Do not output keys outside the list.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text: string = json.content?.[0]?.text ?? "";
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("Claude returned no JSON array");
  return JSON.parse(text.slice(start, end + 1)) as Extracted[];
}

export async function POST(request: Request) {
  const denied = await gate("battlecard.edit");
  if (denied) return denied;

  const { competitorProductId } = (await request.json()) as { competitorProductId?: string };
  if (!competitorProductId) {
    return NextResponse.json({ error: "Missing competitorProductId" }, { status: 400 });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    return NextResponse.json(
      { error: "FIRECRAWL_API_KEY is not set — add it to enable web search." },
      { status: 400 }
    );
  }
  const anthropicKey = await getApiKey("anthropic_api_key", "ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return NextResponse.json({ error: "Anthropic API key not configured (Settings)." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: cp } = (await supabase
    .from("competitor_products")
    .select("id, model_name, display_name, product_line_id, competitors(name)")
    .eq("id", competitorProductId)
    .single()) as {
    data: { id: string; model_name: string; display_name: string | null; product_line_id: string; competitors: { name: string } | null } | null;
  };
  if (!cp) return NextResponse.json({ error: "Competitor product not found" }, { status: 404 });

  const [{ data: dims }, { data: existing }] = await Promise.all([
    supabase
      .from("battlecard_dimensions")
      .select("id, dimension_key, label, unit")
      .eq("product_line_id", cp.product_line_id)
      .order("sort_order") as unknown as Promise<{
      data: { id: string; dimension_key: string; label: string; unit: string | null }[] | null;
    }>,
    supabase
      .from("battlecard_values")
      .select("id, dimension_id, value")
      .eq("competitor_product_id", cp.id) as unknown as Promise<{
      data: { id: string; dimension_id: string; value: string }[] | null;
    }>,
  ]);

  const dimensions = dims ?? [];
  const existingByDim = new Map((existing ?? []).map((v) => [v.dimension_id, v]));

  // Only the cells that are currently empty (no row, or blank value).
  const missing = dimensions.filter((d) => {
    const e = existingByDim.get(d.id);
    return !e || !e.value?.trim();
  });
  if (missing.length === 0) {
    return NextResponse.json({ ok: true, filled: 0, notFound: 0, message: "No empty cells to fill." });
  }

  const brand = cp.competitors?.name ?? "";
  const label = `${brand} ${cp.display_name || cp.model_name}`.trim();
  const dimByKey = new Map(dimensions.map((d) => [d.dimension_key, d]));

  let extracted: Extracted[];
  try {
    const results = await webSearch(`${label} access point full specifications datasheet`, firecrawlKey);
    if (results.length === 0) {
      return NextResponse.json({ ok: true, filled: 0, notFound: missing.length, message: "No web results." });
    }
    const sources = results
      .map((r) => `URL: ${r.url}\n${(r.markdown || r.description || "").slice(0, PER_RESULT)}`)
      .join("\n\n---\n\n")
      .slice(0, MAX_SOURCES);
    extracted = await extract(missing, sources, label, anthropicKey);
  } catch (e) {
    return NextResponse.json(
      { error: "Web search failed", details: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  let filled = 0;
  let notFound = 0;

  for (const item of extracted) {
    const dim = dimByKey.get(item.dimension_key);
    if (!dim) continue;
    // Re-check it's still an empty target (don't clobber a value we didn't intend to).
    const prior = existingByDim.get(dim.id);
    if (prior && prior.value?.trim()) continue;
    if (!item.found || !item.value?.trim()) {
      notFound++;
      continue;
    }
    const payload = {
      value: item.value.trim(),
      extraction_method: "web_search",
      source_url: item.source_url?.trim() || null,
      captured_at: now,
      updated_at: now,
    };
    const { error } = prior
      ? await supabase.from("battlecard_values").update(payload).eq("id", prior.id)
      : await supabase
          .from("battlecard_values")
          .insert({ ...payload, dimension_id: dim.id, competitor_product_id: cp.id, confirmed: false });
    if (!error) filled++;
  }

  return NextResponse.json({ ok: true, filled, notFound, targeted: missing.length });
}
