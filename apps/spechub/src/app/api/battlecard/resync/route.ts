import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { getApiKey } from "@eg/db/settings";

/**
 * POST /api/battlecard/resync  { competitorProductId }
 *
 * Re-scrape one competitor model's datasheet (firecrawl) and AI-extract its
 * specs against the product line's battlecard dimension template, writing the
 * results back as DRAFT values. Cells a PM has already confirmed are left
 * untouched — a re-sync never clobbers human-confirmed data.
 *
 * Requires FIRECRAWL_API_KEY (env) and an Anthropic key (Settings / app_settings).
 */

const MAX_MARKDOWN = 24000;

async function scrapeMarkdown(url: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  if (!res.ok) throw new Error(`firecrawl ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const md = json?.data?.markdown ?? json?.markdown;
  if (!md) throw new Error("firecrawl returned no markdown");
  return String(md).slice(0, MAX_MARKDOWN);
}

interface Extracted {
  dimension_key: string;
  value: string;
  found: boolean;
}

async function extractSpecs(
  dimensions: { dimension_key: string; label: string; unit: string | null }[],
  markdown: string,
  competitorLabel: string,
  anthropicKey: string
): Promise<Extracted[]> {
  const template = dimensions
    .map((d) => `${d.dimension_key} | ${d.label}${d.unit ? ` (${d.unit})` : ""}`)
    .join("\n");

  const system =
    "You are a competitor spec analyst. Fill values ONLY from the provided source text — never guess or invent. " +
    "Return ONLY a JSON array, no prose.";
  const user = `Battlecard dimension template (machine_key | label):\n${template}\n\nOfficial spec source for "${competitorLabel}" (markdown):\n${markdown}\n\nReturn a JSON array with one object per dimension_key: {"dimension_key": "...", "value": "<concise, battlecard-comparable, matching the unit>", "found": true|false}. If a value is not in the source, set found=false and value="". Use compact comparable notation (e.g. "4 × 4:4", "320 MHz", "2.5GbE ×1"). Do not output keys outside the template.`;

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
  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  // Be tolerant of code fences / stray prose around the JSON array.
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
      { error: "FIRECRAWL_API_KEY is not set — add it to enable in-app re-sync." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: cp } = (await supabase
    .from("competitor_products")
    .select("id, model_name, display_name, datasheet_url, product_line_id")
    .eq("id", competitorProductId)
    .single()) as {
    data: { id: string; model_name: string; display_name: string | null; datasheet_url: string | null; product_line_id: string } | null;
  };

  if (!cp) return NextResponse.json({ error: "Competitor product not found" }, { status: 404 });
  if (!cp.datasheet_url) {
    return NextResponse.json(
      { error: "No datasheet URL on this competitor — set one via Manage competitors first." },
      { status: 400 }
    );
  }

  const anthropicKey = await getApiKey("anthropic_api_key", "ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return NextResponse.json({ error: "Anthropic API key not configured (Settings)." }, { status: 400 });
  }

  // Dimension template + existing values (to skip confirmed cells).
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
      .select("id, dimension_id, confirmed")
      .eq("competitor_product_id", cp.id) as unknown as Promise<{
      data: { id: string; dimension_id: string; confirmed: boolean }[] | null;
    }>,
  ]);

  const dimensions = dims ?? [];
  const dimByKey = new Map(dimensions.map((d) => [d.dimension_key, d]));
  const existingByDim = new Map((existing ?? []).map((v) => [v.dimension_id, v]));

  let extracted: Extracted[];
  try {
    const markdown = await scrapeMarkdown(cp.datasheet_url, firecrawlKey);
    extracted = await extractSpecs(dimensions, markdown, cp.display_name || cp.model_name, anthropicKey);
  } catch (e) {
    return NextResponse.json(
      { error: "Extraction failed", details: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const item of extracted) {
    const dim = dimByKey.get(item.dimension_key);
    if (!dim) continue;
    if (!item.found || !item.value?.trim()) {
      notFound++;
      continue;
    }
    const prior = existingByDim.get(dim.id);
    if (prior?.confirmed) {
      skipped++; // never overwrite a PM-confirmed cell
      continue;
    }
    const payload = {
      value: item.value.trim(),
      extraction_method: "ai_firecrawl",
      source_url: cp.datasheet_url,
      captured_at: now,
      updated_at: now,
    };
    const { error } = prior
      ? await supabase.from("battlecard_values").update(payload).eq("id", prior.id)
      : await supabase
          .from("battlecard_values")
          .insert({ ...payload, dimension_id: dim.id, competitor_product_id: cp.id, confirmed: false });
    if (!error) updated++;
  }

  await supabase
    .from("competitor_products")
    .update({ captured_at: now })
    .eq("id", cp.id);

  return NextResponse.json({ ok: true, updated, skipped, notFound, total: extracted.length });
}
