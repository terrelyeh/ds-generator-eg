// Crops the dead margin off every antenna-pattern plot already in Supabase
// Storage, so existing datasheets get the same treatment as new uploads.
//
// Background: the datasheet's antenna page sizes each plot by its grid
// column, not by the file (see the .antenna-image comment in
// preview/[model]/page.tsx). That only pays off if the file's content
// actually reaches its own edges — PM exports of the same canvas run from
// 84% to 100% fill, so identical-looking uploads printed at different
// sizes. /api/upload-image now trims on the way in; this backfills the
// plots uploaded before that.
//
// Storage only, on purpose: Drive keeps the PM's untouched original (and is
// therefore the undo path), Storage holds the render copy. Radio patterns
// are never pulled from Drive by sync, so nothing overwrites the result.
//
// DRY RUN by default. Pass --execute to actually overwrite.
//
//   node scripts/trim-radio-pattern-margins.mjs [--execute] [--model ECW536]

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const EXECUTE = process.argv.includes("--execute");
const modelFlag = process.argv.indexOf("--model");
const ONLY_MODEL = modelFlag >= 0 ? process.argv[modelFlag + 1] : null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONTENT_TYPE = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// Refuse to write a crop this aggressive — a plot losing more than half its
// area means the trim keyed off something that wasn't the margin.
const MAX_AREA_LOSS = 0.5;

const { data: assets, error } = await supabase
  .from("image_assets")
  .select("id, label, file_url, products!inner(model_name)")
  .eq("image_type", "radio_pattern")
  .neq("status", "missing")
  .not("file_url", "is", null);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const rows = assets
  .filter((a) => !ONLY_MODEL || a.products.model_name === ONLY_MODEL)
  .sort((a, b) =>
    (a.products.model_name + a.label).localeCompare(b.products.model_name + b.label),
  );

console.log(
  `${EXECUTE ? "EXECUTE" : "DRY RUN"} — ${rows.length} radio-pattern plots\n`,
);

let trimmed = 0;
let unchanged = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const model = row.products.model_name;
  const name = `${model} ${row.label}`;
  // Storage path is the tail of the public URL: .../datasheets/<path>
  const storagePath = decodeURIComponent(
    row.file_url.split("/storage/v1/object/public/datasheets/")[1] ?? "",
  );
  if (!storagePath) {
    console.log(`  ?  ${name.padEnd(30)} unrecognised URL, skipping`);
    skipped++;
    continue;
  }
  const ext = storagePath.split(".").pop().toLowerCase();
  const contentType = CONTENT_TYPE[ext];
  if (!contentType) {
    console.log(`  ?  ${name.padEnd(30)} unsupported .${ext}, skipping`);
    skipped++;
    continue;
  }

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from("datasheets")
      .download(storagePath);
    if (dlErr) throw new Error(dlErr.message);

    const buffer = Buffer.from(await blob.arrayBuffer());
    const before = await sharp(buffer).metadata();
    // Same threshold as trimPlotMargin() in lib/google/drive-images.ts —
    // keep them in step.
    const out = await sharp(buffer).trim({ threshold: 15 }).toBuffer();
    const after = await sharp(out).metadata();

    const loss = 1 - (after.width * after.height) / (before.width * before.height);
    const geom = `${before.width}x${before.height} -> ${after.width}x${after.height}`;

    if (loss > MAX_AREA_LOSS) {
      console.log(`  !  ${name.padEnd(30)} ${geom} would lose ${(loss * 100).toFixed(0)}% — SKIPPED`);
      skipped++;
      continue;
    }
    if (before.width === after.width && before.height === after.height) {
      console.log(`  =  ${name.padEnd(30)} ${before.width}x${before.height} already tight`);
      unchanged++;
      continue;
    }

    if (EXECUTE) {
      const { error: upErr } = await supabase.storage
        .from("datasheets")
        .upload(storagePath, out, { contentType, upsert: true });
      if (upErr) throw new Error(upErr.message);
    }
    console.log(`  ${EXECUTE ? "+" : "~"}  ${name.padEnd(30)} ${geom}  -${(loss * 100).toFixed(1)}%`);
    trimmed++;
  } catch (err) {
    console.log(`  x  ${name.padEnd(30)} ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

console.log(
  `\n${EXECUTE ? "trimmed" : "would trim"} ${trimmed}, already tight ${unchanged}, skipped ${skipped}, failed ${failed}`,
);
if (!EXECUTE && trimmed) console.log("Re-run with --execute to apply.");
