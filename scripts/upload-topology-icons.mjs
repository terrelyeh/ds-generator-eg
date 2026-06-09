// Scan the Product Icons folder → upload PNGs to Supabase Storage
// (bucket "topology-icons", public) → upsert rows into public.topology_icons.
//
// Self-maintaining + idempotent: re-run any time you add/replace icons.
// Filename convention:  {key}-{view}.png   (view ∈ a|b|front|side|iso|rear|top)
//   ECC100-a.png        → key=ECC100,      view=a
//   ECP212-INT-b.png    → key=ECP212-INT,  view=b   (suffixes like -INT stay in key)
// No recognised view suffix → view="default".
//
// role/label are best-effort guesses from the model prefix; refine them later
// directly in the topology_icons table (the renderer + LLM catalog read them).
//
//   node scripts/upload-topology-icons.mjs                  # default dir, uploads
//   node scripts/upload-topology-icons.mjs "/path/to/icons" # custom dir
//   node scripts/upload-topology-icons.mjs --dry            # parse-only, no upload

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

const DRY = process.argv.includes("--dry");
const dirArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const ICON_DIR = dirArg
  ? path.resolve(dirArg)
  : path.resolve(__dirname, "../../Product Icons");

const BUCKET = "topology-icons";
const VIEW_TOKENS = ["a", "b", "front", "side", "iso", "rear", "top"];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/** Parse "{key}-{view}.png" → { key, view }. */
function parseName(file) {
  const base = file.replace(/\.png$/i, "");
  const m = base.match(/^(.+)-([a-z0-9]+)$/i);
  if (m && VIEW_TOKENS.includes(m[2].toLowerCase())) {
    return { key: m[1], view: m[2].toLowerCase() };
  }
  return { key: base, view: "default" };
}

/** Read width/height straight from the PNG IHDR (no deps). */
function pngSize(buf) {
  if (buf.length < 24) return {};
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Best-effort network role from the model prefix. */
function guessRole(key) {
  const k = key.toUpperCase();
  if (/^ECW|^EWS|^ENH|^EAP/.test(k)) return "ap";
  if (/^ECS/.test(k)) return "switch";
  if (/^ESG/.test(k)) return "gateway";
  if (/^ECC/.test(k)) return "camera";
  if (/NVS/.test(k)) return "nvs";
  if (/^ECP/.test(k)) return "pdu";
  if (/^EOC|^ENS|^ENSTATION/.test(k)) return "bridge";
  return "device";
}

async function main() {
  if (!fs.existsSync(ICON_DIR)) {
    console.error(`Icon folder not found: ${ICON_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(ICON_DIR).filter((f) => /\.png$/i.test(f)).sort();
  console.log(`📁 ${ICON_DIR}`);
  console.log(`🖼  ${files.length} PNG(s)${DRY ? "  (DRY RUN — no upload)" : ""}\n`);
  if (files.length === 0) return;

  // Which keys are real products? (for the optional model_name link)
  const { data: products } = await supabase.from("products").select("model_name");
  const modelSet = new Set((products ?? []).map((p) => p.model_name));

  // Ensure the public bucket exists (ignore "already exists").
  if (!DRY) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "5MB",
    });
    if (error && !/exist/i.test(error.message)) {
      console.error("Bucket error:", error.message);
      process.exit(1);
    }
  }

  let ok = 0;
  const rows = [];
  for (const file of files) {
    const { key, view } = parseName(file);
    const buf = fs.readFileSync(path.join(ICON_DIR, file));
    const { width, height } = pngSize(buf);
    const role = guessRole(key);
    const model_name = modelSet.has(key) ? key : null;
    const storage_path = `${key}-${view}.png`;
    const lowRes = (width ?? 0) < 320;

    if (DRY) {
      console.log(`  ${file}  →  key=${key} view=${view} role=${role} model=${model_name ?? "—"} ${width}x${height}${lowRes ? "  ⚠ low-res(<320)" : ""}`);
      continue;
    }

    const up = await supabase.storage
      .from(BUCKET)
      .upload(storage_path, buf, { contentType: "image/png", upsert: true });
    if (up.error) {
      console.error(`  ✗ ${file}: upload failed — ${up.error.message}`);
      continue;
    }
    const url = supabase.storage.from(BUCKET).getPublicUrl(storage_path).data.publicUrl;

    const { error: upsertErr } = await supabase.from("topology_icons").upsert(
      {
        key,
        view,
        label: model_name ?? key,
        role,
        url,
        storage_path,
        model_name,
        width: width ?? null,
        height: height ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key,view" },
    );
    if (upsertErr) {
      console.error(`  ✗ ${file}: db upsert failed — ${upsertErr.message}`);
      continue;
    }
    ok++;
    rows.push({ key, view, role, model: model_name ?? "—", size: `${width}x${height}`, lowRes });
    console.log(`  ✓ ${file}  →  ${key} (${view}, ${role})${lowRes ? "  ⚠ low-res" : ""}`);
  }

  if (!DRY) {
    console.log(`\n✅ ${ok}/${files.length} icons uploaded + catalogued.`);
    const low = rows.filter((r) => r.lowRes).map((r) => `${r.key}-${r.view}`);
    if (low.length) console.log(`⚠ Low-res (<320px, re-export for crisp nodes): ${low.join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
