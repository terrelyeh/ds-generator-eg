// Scans each product-line Drive folder for duplicate DS folders
// (created by the pre-fix uploadPdfToDrive bug) and reports them.
//
// DRY RUN by default. Pass --execute to actually trash duplicates.
//
//   node scripts/cleanup-duplicate-drive-folders.mjs          # dry-run
//   node scripts/cleanup-duplicate-drive-folders.mjs --execute
//
// Keeps the folder with the MOST recent modifiedTime (where the latest
// PDF was uploaded). Trashes the rest (recoverable from Drive trash).

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const EXECUTE = process.argv.includes("--execute");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}
if (!SA_JSON) {
  console.error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const credentials = JSON.parse(
  SA_JSON.startsWith("{") ? SA_JSON : Buffer.from(SA_JSON, "base64").toString("utf8"),
);

const auth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

async function listProductLines() {
  const { data, error } = await supabase
    .from("product_lines")
    .select("id, name, drive_folder_id, ds_prefix");
  if (error) throw error;
  return (data ?? []).filter((l) => l.drive_folder_id);
}

async function listAllSubfolders(parentFolderId) {
  const results = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name, modifiedTime)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 1000,
      pageToken,
    });
    results.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return results;
}

async function countFilesInFolder(folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 100,
  });
  return res.data.files?.length ?? 0;
}

async function trashFolder(folderId) {
  await drive.files.update({
    fileId: folderId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
}

function groupByName(folders) {
  const groups = new Map();
  for (const f of folders) {
    const list = groups.get(f.name) ?? [];
    list.push(f);
    groups.set(f.name, list);
  }
  return groups;
}

(async () => {
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will trash duplicates)" : "DRY RUN"}\n`);

  const lines = await listProductLines();
  console.log(`Scanning ${lines.length} product line(s)...\n`);

  let totalDupGroups = 0;
  let totalToTrash = 0;

  for (const line of lines) {
    const subfolders = await listAllSubfolders(line.drive_folder_id);
    const groups = groupByName(subfolders);

    const duplicates = [...groups.entries()].filter(([, arr]) => arr.length > 1);
    if (duplicates.length === 0) continue;

    console.log(`\n━━━ ${line.name} (${subfolders.length} subfolders, ${duplicates.length} duplicate group(s)) ━━━`);

    for (const [name, arr] of duplicates) {
      // Enrich each candidate with file count
      const enriched = await Promise.all(
        arr.map(async (f) => ({
          ...f,
          fileCount: await countFilesInFolder(f.id),
        })),
      );

      // Sort: highest fileCount first, then newest modifiedTime
      enriched.sort((a, b) => {
        if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount;
        return new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime();
      });

      const keeper = enriched[0];
      const toTrash = enriched.slice(1);

      totalDupGroups++;
      totalToTrash += toTrash.length;

      console.log(`\n  📁 ${name}  (${enriched.length} copies)`);
      console.log(`     ✅ KEEP    ${keeper.id.slice(0, 20)}… files=${keeper.fileCount} modified=${keeper.modifiedTime}`);
      for (const f of toTrash) {
        console.log(`     🗑  TRASH  ${f.id.slice(0, 20)}… files=${f.fileCount} modified=${f.modifiedTime}`);
        if (EXECUTE) {
          try {
            await trashFolder(f.id);
          } catch (err) {
            console.log(`        ❌ trash failed: ${err instanceof Error ? err.message : err}`);
          }
        }
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total: ${totalDupGroups} duplicate group(s), ${totalToTrash} folder(s) to trash`);
  if (!EXECUTE && totalToTrash > 0) {
    console.log(`\nThis was a DRY RUN. Re-run with --execute to actually trash.`);
  } else if (EXECUTE) {
    console.log(`\n✅ Done. Trashed folders can be recovered from Drive trash within 30 days.`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
