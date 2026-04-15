// Renames all Drive folders and files whose name contains the _jp / _JP
// locale suffix, changing the suffix to _ja (lowercase, ISO 639-1 standard).
//
// Matches only when _jp / _JP appears as a standalone token (followed by a
// non-alphanumeric character or end of name), so things like "_jpg" or
// "JPEG" inside unrelated filenames are NOT rewritten.
//
// DRY RUN by default. Pass --execute to actually rename.
//
//   node scripts/rename-jp-to-ja.mjs            # dry-run
//   node scripts/rename-jp-to-ja.mjs --execute

import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const EXECUTE = process.argv.includes("--execute");

const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SA_JSON) {
  console.error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  process.exit(1);
}

const credentials = JSON.parse(
  SA_JSON.startsWith("{") ? SA_JSON : Buffer.from(SA_JSON, "base64").toString("utf8"),
);
const auth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

// Only rewrite _jp / _JP when it's a standalone suffix — followed by a
// non-alphanumeric character (., _, space, etc) or end-of-string. This
// keeps "_jpg", "_JPEG", etc untouched.
function rewrite(name) {
  return name.replace(/_(?:jp|JP)(?=[^a-zA-Z0-9]|$)/g, "_ja");
}

async function findCandidates() {
  const seen = new Map();
  // Drive query: anything with _JP or _jp in the name (case-sensitive).
  for (const needle of ["_JP", "_jp"]) {
    let pageToken;
    do {
      const res = await drive.files.list({
        q: `trashed = false and name contains '${needle}'`,
        fields: "nextPageToken, files(id, name, mimeType, parents)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 1000,
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        if (seen.has(f.id)) continue;
        const newName = rewrite(f.name);
        if (newName !== f.name) {
          seen.set(f.id, {
            id: f.id,
            oldName: f.name,
            newName,
            mimeType: f.mimeType,
          });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return [...seen.values()];
}

(async () => {
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will rename)" : "DRY RUN"}\n`);

  const candidates = await findCandidates();
  const folders = candidates.filter((c) => c.mimeType === "application/vnd.google-apps.folder");
  const files = candidates.filter((c) => c.mimeType !== "application/vnd.google-apps.folder");

  console.log(`Found ${candidates.length} item(s) to rename (${folders.length} folder(s), ${files.length} file(s))\n`);

  if (folders.length > 0) {
    console.log(`━━━ FOLDERS ━━━`);
    for (const c of folders) {
      console.log(`  📁  ${c.oldName}`);
      console.log(`      → ${c.newName}`);
    }
    console.log();
  }

  if (files.length > 0) {
    console.log(`━━━ FILES ━━━`);
    for (const c of files) {
      console.log(`  📄  ${c.oldName}`);
      console.log(`      → ${c.newName}`);
    }
    console.log();
  }

  if (!EXECUTE) {
    console.log(`Dry run. Re-run with --execute to actually rename.`);
    return;
  }

  // Execute. Order doesn't matter (rename is id-based, content/parents untouched)
  // but we rename files first to keep output readable.
  let success = 0;
  let failed = 0;
  for (const c of [...files, ...folders]) {
    try {
      await drive.files.update({
        fileId: c.id,
        requestBody: { name: c.newName },
        supportsAllDrives: true,
      });
      success++;
    } catch (err) {
      console.log(`  ❌ ${c.oldName} → ${c.newName}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }
  console.log(`\n✅ Done. Renamed ${success} item(s), ${failed} failed.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
