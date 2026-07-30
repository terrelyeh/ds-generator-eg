// Product-line onboarding step 1: inspect a new line's Google Sheet + Drive
// folder so the `product_lines` row can be filled in without guessing.
//
//   node apps/spechub/scripts/inspect-line-sources.mjs <sheet-url-or-id> [drive-folder-url-or-id]
//
// Prints every tab with its GID (matched against the sync contract in
// docs/product-line-onboarding.md §2) and walks the Drive tree two levels deep
// so drive_folder_id and ds_images_folder_id don't get swapped (pitfall #53).

import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SA_JSON) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set (apps/spechub/.env.local)");
const credentials = JSON.parse(
  SA_JSON.startsWith("{") ? SA_JSON : Buffer.from(SA_JSON, "base64").toString("utf8"),
);
const auth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive",
  ],
});
const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });

// Accepts a bare id or any Drive/Sheets URL.
const idFrom = (arg) => {
  if (!arg) return null;
  const m = arg.match(/\/(?:d|folders)\/([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : arg.trim();
};

const [sheetArg, folderArg] = process.argv.slice(2);
if (!sheetArg) {
  console.error("usage: node inspect-line-sources.mjs <sheet-url-or-id> [drive-folder-url-or-id]");
  process.exit(1);
}

// Which product_lines column each tab feeds, keyed by a loose title match.
// PMs punctuate tab names freely ("(1)Web -Overview"), so keep these loose —
// and expect several tabs to match `comparison`.
const CONTRACT = [
  [/\[for ds\].*(overview|feature)/i, "ds_overview_gid  (line_datasheets)"],
  [/\[for ds\].*spec/i, "ds_specs_gid  (series comparison table)"],
  [/web\s*[-–—]?\s*overview/i, "overview_gid"],
  [/detail\s*spec/i, "detail_specs_gid"],
  [/revision|change\s*log/i, "revision_log_gid"],
  [/compar/i, "comparison_gid"],
];

const sheetId = idFrom(sheetArg);
console.log(`\n📄 Spreadsheet ${sheetId}`);
const meta = await sheets.spreadsheets.get({
  spreadsheetId: sheetId,
  fields: "properties(title),sheets(properties(sheetId,title,index))",
});
console.log(`   "${meta.data.properties.title}"\n`);
console.log(`   ${"GID".padEnd(14)}${"TAB".padEnd(44)}FEEDS`);
console.log(`   ${"-".repeat(14)}${"-".repeat(44)}${"-".repeat(34)}`);
// First tab to match a column wins it; later matches are demoted to a note so
// the leading candidate stays obvious among five "Comparison" tabs — and so a
// stale "Web Detail Specs(待刪)" can't masquerade as the real one.
const claimed = new Set();
for (const s of meta.data.sheets ?? []) {
  const { sheetId: gid, title } = s.properties;
  const hit = CONTRACT.find(([re]) => re.test(title))?.[1];
  let feeds = "";
  if (hit && !claimed.has(hit)) {
    claimed.add(hit);
    feeds = hit;
  } else if (hit) {
    feeds = `(also matches ${hit.split("  ")[0]})`;
  }
  console.log(`   ${String(gid).padEnd(14)}${title.padEnd(44)}${feeds}`);
}

if (!folderArg) {
  console.log("\n(no Drive folder passed — rerun with the line's folder URL to map the image folders)\n");
  process.exit(0);
}

const listChildren = async (id) => {
  const res = await drive.files.list({
    q: `'${id}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 200,
    orderBy: "folder,name",
  });
  return res.data.files ?? [];
};

const folderId = idFrom(folderArg);
const root = await drive.files.get({
  fileId: folderId,
  fields: "id, name, trashed",
  supportsAllDrives: true,
});
// A trashed folder still accepts writes — generate-pdf reports success while the
// PDF lands in the bin, and image listings come back empty rather than erroring
// (pitfall #65). Catch it here, before the id is ever written to the DB.
const trashWarn = root.data.trashed ? "   ⚠️  IN TRASH — do not use this id" : "";
console.log(`\n📁 ${root.data.name}   ${folderId}${trashWarn}`);

const isFolder = (f) => f.mimeType === "application/vnd.google-apps.folder";
for (const child of await listChildren(folderId)) {
  if (!isFolder(child)) {
    console.log(`   📄 ${child.name}`);
    continue;
  }
  const grandkids = await listChildren(child.id);
  const imgs = grandkids.filter((g) => /\.(png|jpe?g)$/i.test(g.name)).length;
  const hint = /^ds images$/i.test(child.name) ? "  ← ds_images_folder_id" : "";
  console.log(`   📁 ${child.name.padEnd(40)} ${child.id}${hint}`);
  console.log(`      ${grandkids.length} item(s)${imgs ? `, ${imgs} image(s)` : ""}`);
  for (const g of grandkids.slice(0, 12)) {
    console.log(`      ${isFolder(g) ? "📁" : "📄"} ${g.name}`);
  }
  if (grandkids.length > 12) console.log(`      … ${grandkids.length - 12} more`);
}
console.log(
  `\n→ drive_folder_id = the folder holding per-model DS_* folders` +
    `\n→ ds_images_folder_id = the "DS Images" subfolder inside it\n`,
);
