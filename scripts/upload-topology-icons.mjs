// Sync product topology icons → Supabase Storage ("topology-icons", public)
// + the public.topology_icons catalog. Idempotent — re-run any time.
//
// SOURCE (pick one):
//   --drive=<folderId>   pull from the shared Google Drive folder (recommended;
//                        matches the product-image workflow — you manage icons
//                        in Drive, just re-run this). Walks subfolders too.
//   <path>               or a local folder (default: ../Product Icons)
//
// Filename convention:  {key}-{view}.png   (view ∈ a|b|c|front|side|iso|rear|top)
//   ECC100-a.png        → key=ECC100,      view=a
//   ECP212-INT-b.png    → key=ECP212-INT,  view=b   (suffixes like -INT stay in key)
//
// role (drives diagram layering) is derived from the model prefix, OR from the
// parent Drive folder when the icon is a non-product/generic node (drop those
// into the "Cloud & Internet" / "General" folders). Refine later in the table.
//
//   node scripts/upload-topology-icons.mjs --drive=<id>          # sync from Drive
//   node scripts/upload-topology-icons.mjs --drive=<id> --dry    # preview only
//   node scripts/upload-topology-icons.mjs "/path/to/icons"      # from local dir

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

const DRY = process.argv.includes("--dry");
const driveArg = process.argv.find((a) => a.startsWith("--drive="));
const DRIVE_FOLDER = driveArg ? driveArg.split("=")[1] : null;
const dirArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const ICON_DIR = dirArg ? path.resolve(dirArg) : path.resolve(__dirname, "../../Product Icons");

const BUCKET = "topology-icons";
const VIEW_TOKENS = ["a", "b", "c", "front", "side", "iso", "rear", "top"];

// Parent folder name (lowercased) → role, for generic/non-product nodes you
// place in those Drive folders. Product icons in the root fall through to the
// prefix-based guess below.
const FOLDER_ROLE = {
  "ap": "ap", "switch": "switch", "gateway": "gateway", "pdu": "pdu",
  "surveillance": "camera", "cloud & internet": "internet", "general": "generic",
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function parseName(file) {
  const base = file.replace(/\.png$/i, "");
  const m = base.match(/^(.+)-([a-z0-9]+)$/i);
  if (m && VIEW_TOKENS.includes(m[2].toLowerCase())) {
    return { key: m[1], view: m[2].toLowerCase() };
  }
  return { key: base, view: "default" };
}

function pngSize(buf) {
  if (buf.length < 24) return {};
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Network role from the model prefix (authoritative mapping per products DB). */
function guessRole(key) {
  const k = key.toUpperCase();
  if (/^ECW|^ENH|^EWS|^EAP/.test(k)) return "ap";            // Cloud AP / outdoor AP
  if (/^ECS|^ES\d/.test(k)) return "switch";                  // Cloud / Unmanaged switch
  if (/^EXT/.test(k)) return "extender";                      // Switch Extender
  if (/^ESG/.test(k)) return "gateway";                       // Cloud VPN Firewall / SD-WAN
  if (/^ECC/.test(k)) return "camera";                        // Cloud Camera
  if (/^EVS/.test(k)) return "nvs";                           // Cloud AI-NVS
  if (/^ECP/.test(k)) return "pdu";                           // Cloud PDU
  if (/^EOC|^ENSTATION/.test(k)) return "bridge";             // outdoor bridge / CPE
  return "device";                                            // unknown (e.g. EPC) — set manually
}

/** Collect {name, parent, buffer?} from Google Drive (recursive). */
async function collectFromDrive(rootId, downloadBytes) {
  const SA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!SA) { console.error("Missing GOOGLE_SERVICE_ACCOUNT_JSON"); process.exit(1); }
  const cred = JSON.parse(SA.startsWith("{") ? SA : Buffer.from(SA, "base64").toString("utf8"));
  const auth = new JWT({ email: cred.client_email, key: cred.private_key, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const drive = google.drive({ version: "v3", auth });
  const out = [];
  async function walk(id, parentName) {
    let pageToken;
    do {
      const res = await drive.files.list({
        q: `'${id}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 1000,
      });
      for (const f of res.data.files ?? []) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          await walk(f.id, f.name);
        } else if (/\.png$/i.test(f.name)) {
          let buffer;
          if (downloadBytes) {
            const dl = await drive.files.get({ fileId: f.id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
            buffer = Buffer.from(dl.data);
          }
          out.push({ name: f.name, parent: parentName, buffer });
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }
  await walk(rootId, "(root)");
  return out;
}

function collectFromLocal(dir) {
  if (!fs.existsSync(dir)) { console.error(`Folder not found: ${dir}`); process.exit(1); }
  return fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort()
    .map((name) => ({ name, parent: path.basename(dir), buffer: fs.readFileSync(path.join(dir, name)) }));
}

async function main() {
  console.log(DRIVE_FOLDER ? `☁️  Drive folder ${DRIVE_FOLDER}` : `📁 ${ICON_DIR}`);
  console.log(DRY ? "🔍 DRY RUN — no download/upload\n" : "");

  const items = DRIVE_FOLDER ? await collectFromDrive(DRIVE_FOLDER, !DRY) : collectFromLocal(ICON_DIR);
  console.log(`🖼  ${items.length} PNG(s)\n`);
  if (items.length === 0) return;

  const { data: products } = await supabase.from("products").select("model_name");
  const modelSet = new Set((products ?? []).map((p) => p.model_name));

  if (!DRY) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "5MB" });
    if (error && !/exist/i.test(error.message)) { console.error("Bucket error:", error.message); process.exit(1); }
  }

  let ok = 0;
  const byRole = {};
  const lowResList = [];
  const noModelList = [];
  for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
    const { key, view } = parseName(item.name);
    const folderRole = FOLDER_ROLE[(item.parent || "").toLowerCase()];
    const role = folderRole ?? guessRole(key);
    const model_name = modelSet.has(key) ? key : null;
    const storage_path = `${key}-${view}.png`;
    byRole[role] = (byRole[role] || 0) + 1;
    if (!model_name) noModelList.push(key);

    if (DRY) {
      console.log(`  ${item.name}  →  key=${key} view=${view} role=${role} model=${model_name ?? "—"}`);
      continue;
    }

    const { width, height } = pngSize(item.buffer);
    if ((width ?? 0) < 320) lowResList.push(`${key}-${view}(${width}px)`);
    const up = await supabase.storage.from(BUCKET).upload(storage_path, item.buffer, { contentType: "image/png", upsert: true });
    if (up.error) { console.error(`  ✗ ${item.name}: ${up.error.message}`); continue; }
    const url = supabase.storage.from(BUCKET).getPublicUrl(storage_path).data.publicUrl;
    const { error: upErr } = await supabase.from("topology_icons").upsert({
      key, view, label: model_name ?? key, role, url, storage_path, model_name,
      width: width ?? null, height: height ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: "key,view" });
    if (upErr) { console.error(`  ✗ ${item.name}: db — ${upErr.message}`); continue; }
    ok++;
  }

  console.log(`\nRole 分佈: ${Object.entries(byRole).map(([r, n]) => `${r}=${n}`).join("  ")}`);
  const uniqNoModel = [...new Set(noModelList)];
  if (uniqNoModel.length) console.log(`未對到 products(catalog 仍收錄): ${uniqNoModel.join(", ")}`);
  if (!DRY) {
    console.log(`\n✅ ${ok}/${items.length} icons synced.`);
    if (lowResList.length) console.log(`⚠ 低解析(<320px,建議重出): ${lowResList.join(", ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
