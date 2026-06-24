/**
 * Verify the `support` knowledge source end-to-end without a running server:
 *   1. INTERNAL /ask context (no knowledgeAreasAllowed)        → support chunks ARE retrieved
 *   2. EXTERNAL /api/v1/search context (knowledgeAreasAllowed: []) → support chunks are EXCLUDED
 *
 * Run from repo root with the engenie env:
 *   npm -w engenie exec tsx scripts/verify-support-retrieval.ts -- "your question"
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", ".env"]) {
  const p = join(appDir, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] == null) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  const q =
    process.argv.slice(2).join(" ").trim() ||
    "my access points keep showing offline in the cloud dashboard — how do I troubleshoot?";
  const { retrieveDocuments } = await import("../src/lib/rag/retrieve");

  console.log(`Q: ${q}\n`);

  const internal = await retrieveDocuments({ question: q, finalLimit: 8 });
  console.log(`INTERNAL /ask (no knowledgeAreasAllowed) — ${internal.length} chunks:`);
  for (const d of internal) {
    console.log(`   [${d.source_type}] ${d.title}  (sim ${d.similarity.toFixed(3)})`);
  }
  const internalSupport = internal.filter((d) => d.source_type === "support").length;
  console.log(`   → support chunks surfaced: ${internalSupport}\n`);

  const external = await retrieveDocuments({
    question: q,
    finalLimit: 8,
    strictScope: true,
    knowledgeAreasAllowed: [],
  });
  console.log(`EXTERNAL /api/v1/search (knowledgeAreasAllowed: []) — ${external.length} chunks:`);
  for (const d of external) console.log(`   [${d.source_type}] ${d.title}`);
  const externalSupport = external.filter((d) => d.source_type === "support").length;
  console.log(
    `   → support chunks leaked: ${externalSupport}  ` +
      (externalSupport === 0 ? "✓ internal-only holds" : "✗ LEAK — investigate"),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
