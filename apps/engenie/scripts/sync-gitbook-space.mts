/**
 * Re-sync one Gitbook space from the terminal, without the serverless time limit.
 *
 * The Knowledge UI drives the same `ingestGitbook()` through `/api/documents`,
 * which is capped at maxDuration 300s. A large space (Cloud User Manual is ~150
 * pages) can exceed that — the request dies mid-run and nothing is written, so
 * the card's "last indexed" date silently stays put. Running it here removes the
 * clock so we can see the real outcome (and finish the sync).
 *
 *   npm -w engenie exec tsx scripts/sync-gitbook-space.mts -- <spaceUrl> "<label>" [--force] [--no-vision]
 *
 * Example:
 *   npm -w engenie exec tsx scripts/sync-gitbook-space.mts -- \
 *     https://doc.engenius.ai/home-cloud-user-manual "Cloud User Manual"
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load engenie env BEFORE importing anything that builds a DB/embedding client.
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

const { ingestGitbook } = await import("../src/lib/rag/ingest-gitbook");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const [spaceUrl, spaceLabel] = argv.filter((a) => !a.startsWith("--"));

if (!spaceUrl || !spaceLabel) {
  console.error('Usage: sync-gitbook-space.mts <spaceUrl> "<label>" [--force] [--no-vision]');
  process.exit(1);
}

console.log(`Space : ${spaceLabel}\nURL   : ${spaceUrl}`);
console.log(`force=${flags.has("--force")}  vision=${!flags.has("--no-vision")}\n`);

const t0 = Date.now();
const r = await ingestGitbook({
  spaceUrl,
  spaceLabel,
  force: flags.has("--force"),
  enableVision: !flags.has("--no-vision"),
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n=== done in ${secs}s ===`);
console.log(`  pages fetched : ${r.pages_fetched}`);
console.log(`  pages skipped : ${r.pages_skipped}   (unchanged per sitemap lastmod)`);
console.log(`  chunks written: ${r.processed}`);
console.log(`  chunks skipped: ${r.skipped}   (content_hash unchanged)`);
console.log(`  metadata refreshed: ${r.metadata_refreshed}   (unchanged content, drifted metadata)`);
if (r.images_described !== undefined) console.log(`  images described: ${r.images_described}`);
if (r.errors.length) {
  console.log(`\n  errors (${r.errors.length}):`);
  for (const e of r.errors.slice(0, 15)) console.log(`    - ${e.slice(0, 160)}`);
} else {
  console.log(`  errors: none`);
}
