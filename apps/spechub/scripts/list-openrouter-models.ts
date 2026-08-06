/**
 * Find OpenRouter model slugs, so switching models is a lookup rather
 * than a guess. Needs no API key — the catalog endpoint is public.
 *
 * Paste the slug into AVAILABLE_PROVIDERS (lib/translate/types.ts) to add
 * a translation model, or into lib/llm/models.ts for a fixed-purpose one.
 *
 *   npx tsx scripts/list-openrouter-models.ts anthropic
 *   npx tsx scripts/list-openrouter-models.ts gemini-3
 *   npx tsx scripts/list-openrouter-models.ts            # everything
 */
interface ORModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

/** OpenRouter prices are per-token strings; datasheets think in millions. */
function perMillion(v: string | undefined): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  return `$${(n * 1_000_000).toFixed(2)}`;
}

async function main() {
  const filter = (process.argv[2] ?? "").toLowerCase();

  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  const all = ((await res.json()).data as ORModel[]) ?? [];

  const rows = all
    .filter((m) => !m.id.endsWith(":batch"))
    .filter((m) => !filter || m.id.toLowerCase().includes(filter))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (rows.length === 0) {
    console.log(`no models matching "${filter}" (of ${all.length} total)`);
    return;
  }

  const w = Math.min(52, Math.max(...rows.map((m) => m.id.length)));
  console.log(`${"slug".padEnd(w)}  ${"ctx".padStart(9)}  ${"in/1M".padStart(8)}  ${"out/1M".padStart(8)}`);
  console.log("-".repeat(w + 32));
  for (const m of rows) {
    console.log(
      `${m.id.padEnd(w)}  ${String(m.context_length ?? "?").padStart(9)}  ` +
      `${perMillion(m.pricing?.prompt).padStart(8)}  ${perMillion(m.pricing?.completion).padStart(8)}`,
    );
  }
  console.log(`\n${rows.length} shown / ${all.length} total (":batch" variants hidden)`);
}

main();
