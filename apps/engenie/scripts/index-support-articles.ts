/**
 * One-off: index the refinery's `support` articles into the RAG `documents` store.
 *
 * Reads refined `.md` files (default: the Intercom cluster output in /dev/RAG) and
 * ingests them under source_type='support', scoped to the internal-only `support`
 * knowledge area. Idempotent: ensures the knowledge area exists; ingest is a clean
 * replace per article.
 *
 * Run from the repo root with the engenie env (Supabase service role from
 * apps/engenie/.env.local; OpenAI embedding key is read from app_settings in DB):
 *   npm -w engenie exec tsx scripts/index-support-articles.ts -- [articlesDir]
 *   npm -w engenie exec tsx scripts/index-support-articles.ts -- --dry   # parse only
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load engenie env (.env.local then .env) BEFORE importing the DB/embedding client.
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

const DEFAULT_DIR = "/Users/terrelyeh/dev/RAG/output/refined/intercom";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const dir = args.find((a) => !a.startsWith("--")) || DEFAULT_DIR;

  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} .md articles in ${dir}${dry ? "  (DRY RUN — no writes)" : ""}`);
  if (!files.length) return;

  const { ingestSupport, SUPPORT_KNOWLEDGE_AREA } = await import("../src/lib/rag/ingest-support");

  if (!dry) {
    // Ensure the internal knowledge area exists (kind='knowledge' → private/opt-in).
    const { createAdminClient } = await import("@eg/db/admin");
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("solutions" as "products")
      .select("slug")
      .eq("slug", SUPPORT_KNOWLEDGE_AREA)
      .maybeSingle();
    if (existing) {
      console.log(`✓ knowledge area '${SUPPORT_KNOWLEDGE_AREA}' exists`);
    } else {
      const { error } = await supabase.from("solutions" as "products").insert({
        slug: SUPPORT_KNOWLEDGE_AREA,
        name: "Support Knowledge",
        label: "Support Knowledge",
        kind: "knowledge",
        sort_order: 210,
        color_primary: "#475569",
      } as Record<string, unknown>);
      if (error) throw new Error(`create knowledge area failed: ${JSON.stringify(error)}`);
      console.log(`✓ created knowledge area '${SUPPORT_KNOWLEDGE_AREA}'`);
    }
  }

  const articles = files.map((f) => ({ markdown: readFileSync(join(dir, f), "utf8") }));
  const result = await ingestSupport({ articles, dryRun: dry });

  console.log(`\nsource_type='support' → knowledge area '${result.knowledgeArea}'`);
  console.log(
    `articles=${result.articles.length} chunks=${result.totalChunks}` +
      (dry ? "  (not written)" : ` upserted=${result.totalProcessed}`),
  );
  if (result.skipped.length) console.log(`skipped: ${JSON.stringify(result.skipped)}`);
  for (const a of result.articles) {
    console.log(
      `  - ${a.sourceId}  q${a.quality ?? "?"}  ${a.chunks}c  models:${a.models.slice(0, 5).join(",") || "–"}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
