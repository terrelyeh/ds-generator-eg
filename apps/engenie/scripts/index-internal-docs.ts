/**
 * Index an internal document package — a folder of `.md` files (an SRS with
 * its references, a PRD bundle, design docs) — into the RAG `documents` store
 * under source_type='internal_doc', scoped to a kind='knowledge' area.
 *
 * Run from the repo root with the engenie env (Supabase service role from
 * apps/engenie/.env.local; the OpenAI embedding key is read from app_settings):
 *
 *   npm -w engenie exec tsx scripts/index-internal-docs.ts -- <dir> \
 *     --collection craft-ai-srs --label "Craft AI SRS v2.0 (Review Draft)" \
 *     --version 2.0 --status review-draft [--run] [--prune]
 *
 * Defaults to DRY-RUN: prep + chunk, print what would be written, flag
 * oversized chunks. Pass --run to embed + upsert.
 *
 * Options:
 *   --collection <slug>   package id → source_id prefix + metadata.collection (required)
 *   --label <text>        chunk prefix "[label > title]" (required; say the version + status here)
 *   --version <v>         metadata.version
 *   --status <s>          metadata.status, e.g. review-draft / approved
 *   --area <slug>         knowledge area (default: rd-internal)
 *   --area-label <text>   label used if the area has to be created (default: RD 內部知識)
 *   --url-base <url>      source_url = url-base + relPath (only if the package is hosted somewhere stable)
 *   --only <substr>       limit to files whose relative path contains <substr> (never combine with --prune)
 *   --run                 actually write (default: dry-run)
 *   --prune               after a full --run, delete this collection's sources the run did not see
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
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

function walk(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, root));
    else if (/\.md$/i.test(name)) out.push(relative(root, p));
  }
  return out.sort();
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string): string | undefined => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dir = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
  const collection = opt("--collection");
  const label = opt("--label");
  const run = args.includes("--run");
  const prune = args.includes("--prune");
  const only = opt("--only");

  if (!dir || !collection || !label) {
    console.error(
      'usage: index-internal-docs <dir> --collection <slug> --label "<prefix>" [--version v] [--status s] [--area slug] [--area-label text] [--url-base url] [--only substr] [--run] [--prune]',
    );
    process.exit(1);
  }
  if (prune && only) {
    console.error("--prune needs a run that saw the whole package; drop --only.");
    process.exit(1);
  }
  if (prune && !run) {
    console.error("--prune only applies with --run.");
    process.exit(1);
  }

  const area = opt("--area") ?? "rd-internal";
  const areaLabel = opt("--area-label") ?? "RD 內部知識";
  const urlBase = opt("--url-base");

  let relPaths = walk(dir);
  if (only) relPaths = relPaths.filter((p) => p.includes(only));
  console.log(`Found ${relPaths.length} .md files in ${dir}${run ? "" : "  (DRY RUN — no writes)"}`);
  if (!relPaths.length) return;

  const files = relPaths.map((relPath) => ({
    relPath,
    markdown: readFileSync(join(dir, relPath), "utf8"),
    sourceUrl: urlBase ? urlBase.replace(/\/?$/, "/") + relPath : null,
  }));

  const {
    ingestInternalDocs,
    ensureKnowledgeArea,
    assertKnowledgeArea,
    pruneVanishedInternalDocs,
    uploadInternalDocAssets,
    assetContentType,
  } = await import("../src/lib/rag/ingest-internal-doc");
  const { prepareInternalDoc } = await import("../src/lib/rag/internal-doc-prep");
  const { MAX_CHUNK_CHARS } = await import("../src/lib/rag/chunk");

  if (run) {
    const { createAdminClient } = await import("@eg/db/admin");
    const supabase = createAdminClient();
    const state = await ensureKnowledgeArea(supabase, area, areaLabel);
    console.log(`✓ knowledge area '${area}' ${state === "created" ? `created ("${areaLabel}")` : "exists"}`);
    await assertKnowledgeArea(supabase, area);
  }

  // Images the documents reference. Local ones are uploaded to the private
  // assets bucket (on --run) so answers citing that section can show them;
  // only images actually there get attached — a figure that 404s is worse
  // than none.
  const referenced = new Set<string>();
  let external = 0;
  for (const f of files) {
    for (const img of prepareInternalDoc(f).images) {
      if (img.path) referenced.add(img.path);
      else if (img.url) external++;
    }
  }
  const onDisk = [...referenced].filter((p) => existsSync(join(dir, p)) && assetContentType(p) !== null);
  const missing = [...referenced].filter((p) => !onDisk.includes(p));
  let assets = new Set(onDisk);
  if (run && onDisk.length > 0) {
    const { createAdminClient } = await import("@eg/db/admin");
    assets = await uploadInternalDocAssets(
      createAdminClient(),
      collection,
      onDisk.map((p) => ({ path: p, bytes: readFileSync(join(dir, p)) })),
    );
  }
  console.log(
    `images: ${referenced.size} referenced, ${onDisk.length} found` +
      (run ? `, ${assets.size} uploaded` : " (not uploaded — dry run)") +
      (external ? `, ${external} external` : ""),
  );
  if (missing.length) console.log(`⚠ missing or unsupported: ${missing.join(", ")}`);

  const result = await ingestInternalDocs({
    knowledgeArea: area,
    collection,
    label,
    version: opt("--version"),
    status: opt("--status"),
    files,
    assets,
    dryRun: !run,
  });

  console.log(`\nsource_type='internal_doc'  collection='${collection}'  area='${area}'  label="${label}"`);
  console.log(
    `files=${result.articles.length} chunks=${result.totalChunks}` +
      (run ? ` upserted=${result.totalProcessed}` : "  (not written)"),
  );
  if (result.skipped.length) console.log(`skipped: ${JSON.stringify(result.skipped)}`);

  const oversized: { sourceId: string; title: string; chars: number }[] = [];
  for (const a of result.articles) {
    const prep = result.prepared.find((p) => `${collection}/${p.sourceId}` === a.sourceId);
    const dropped = prep?.dropped.length ? `  dropped: ${prep.dropped.join(" | ")}` : "";
    const imgs = prep?.images.length ? `  🖼 ${prep.images.length}` : "";
    console.log(`  - ${a.sourceId}\n      "${a.title}"  ${a.chunks}c${imgs}${dropped}`);
    for (const c of a.previews ?? []) {
      if (c.chars > MAX_CHUNK_CHARS) oversized.push({ sourceId: a.sourceId, title: c.title, chars: c.chars });
    }
  }
  if (oversized.length) {
    console.log(`\n⚠ ${oversized.length} chunk(s) over ${MAX_CHUNK_CHARS} chars (embedding will be truncated):`);
    for (const o of oversized) console.log(`  ${o.chars}  ${o.sourceId}  "${o.title}"`);
  }

  if (run && prune) {
    const { createAdminClient } = await import("@eg/db/admin");
    const keep = new Set(result.articles.map((a) => a.sourceId));
    const gone = await pruneVanishedInternalDocs(createAdminClient(), collection, keep);
    console.log(gone.length ? `\n✓ pruned ${gone.length} vanished source(s):\n  ${gone.join("\n  ")}` : "\n✓ nothing to prune");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
