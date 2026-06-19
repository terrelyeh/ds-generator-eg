/**
 * CLI trigger for vertical-guide indexing.
 *
 *   npx tsx apps/engenie/scripts/index-vertical-guide.ts <master.md> [options]
 *
 * Defaults to DRY-RUN (parse + chunk + plan, no embed/no DB write).
 * Pass --run to actually embed + upsert into `documents`.
 *
 * Options:
 *   --run                 actually write (default: dry-run)
 *   --source-id <id>      override the source_id (default: filename minus `guide-`/`.md`)
 *   --url <url>           deployed guide URL (citation link)
 *   --solution <slug>     product-kind solution slug (default: cloud)
 *   --product-lines "A,B" comma-separated product lines
 */

import { readFileSync } from "fs";
import { basename } from "path";
import { ingestVerticalGuide } from "../src/lib/rag/ingest-vertical-guide";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: index-vertical-guide <master.md> [--run] [--source-id id] [--url u] [--solution slug] [--product-lines \"A,B\"]");
    process.exit(1);
  }
  const opt = (k: string): string | undefined => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const markdown = readFileSync(file, "utf8");
  const sourceId =
    opt("--source-id") ?? basename(file).replace(/^guide-/, "").replace(/\.md$/, "");
  const productLines = opt("--product-lines")?.split(",").map((s) => s.trim()).filter(Boolean);

  const res = await ingestVerticalGuide({
    sourceId,
    markdown,
    sourceUrl: opt("--url") ?? null,
    solution: opt("--solution") ?? "cloud",
    productLines,
    dryRun: !args.includes("--run"),
  });

  console.log(JSON.stringify(res, null, 2));
  console.error(
    res.dryRun
      ? `\n[DRY-RUN] ${res.chunks} chunks from ${res.included.length} rag:✓ sections — nothing written. Add --run to index.`
      : `\n[DONE] ${res.processed} chunks written for "${res.sourceId}".`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
