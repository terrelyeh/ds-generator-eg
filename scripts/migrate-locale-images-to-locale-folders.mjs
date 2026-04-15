// Migrates locale-suffixed images (e.g. ECC500Z_hardware_zh.png) that
// accidentally ended up in the EN "DS Images" folder over to their correct
// locale-specific "DS Images" folder (e.g. Cloud Camera_zh/DS Images/).
//
// This is a one-off cleanup for the bug fixed in commit b2231ec where
// /api/upload-image ignored the `locale` parameter and wrote every file into
// the EN image folder regardless of language.
//
// Scope:
//   - Iterates every product line
//   - Finds files inside product_lines.ds_images_folder_id whose name ends
//     in _<localeSuffix>.<ext> for the configured locales (ja, zh)
//   - Moves them (Drive files.update with addParents/removeParents) into
//     the matching <lineName>_<locale>/DS Images folder
//   - Auto-creates the locale DS Images folder if it doesn't exist
//
// DRY RUN by default. Pass --execute to actually move.

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const EXECUTE = process.argv.includes("--execute");

const LOCALES = [
  { suffix: "ja", lineSuffix: "ja" },
  { suffix: "zh", lineSuffix: "zh" },
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SUPABASE_URL || !SUPABASE_KEY || !SA_JSON) {
  console.error("Missing env vars");
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
    .select("id, name, ds_images_folder_id")
    .not("ds_images_folder_id", "is", null);
  if (error) throw error;
  return data ?? [];
}

async function listFilesInFolder(folderId) {
  const results = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken, files(id, name, parents)",
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

async function findChildFolder(parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function createChildFolder(parentId, name) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    supportsAllDrives: true,
    fields: "id",
  });
  return res.data.id;
}

async function resolveLocaleDsImagesFolder(enDsImagesFolderId, lineName, localeLineSuffix, executeMode) {
  // Walk up: enDsImagesFolderId → enLineFolderId → rootFolderId
  const enDsFolder = await drive.files.get({
    fileId: enDsImagesFolderId,
    fields: "parents",
    supportsAllDrives: true,
  });
  const enLineFolderId = enDsFolder.data.parents?.[0];
  if (!enLineFolderId) throw new Error("EN DS Images has no parent");

  const enLineFolder = await drive.files.get({
    fileId: enLineFolderId,
    fields: "parents",
    supportsAllDrives: true,
  });
  const rootFolderId = enLineFolder.data.parents?.[0];
  if (!rootFolderId) throw new Error("EN line folder has no parent");

  const localeLineName = `${lineName}_${localeLineSuffix}`;
  const localeLineFolderId = await findChildFolder(rootFolderId, localeLineName);
  if (!localeLineFolderId) {
    throw new Error(`Locale product line folder "${localeLineName}" not found`);
  }

  let dsImagesId = await findChildFolder(localeLineFolderId, "DS Images");
  if (!dsImagesId) {
    if (!executeMode) {
      // Dry-run — pretend we'd create it
      return `(would create DS Images inside ${localeLineName})`;
    }
    console.log(`  + creating DS Images inside ${localeLineName}`);
    dsImagesId = await createChildFolder(localeLineFolderId, "DS Images");
  }
  return dsImagesId;
}

(async () => {
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

  const lines = await listProductLines();
  console.log(`Scanning ${lines.length} product line(s)...\n`);

  let totalMoves = 0;

  for (const line of lines) {
    const files = await listFilesInFolder(line.ds_images_folder_id);
    const localeFiles = [];

    for (const f of files) {
      // Match <model>_<anything>_<localeSuffix>.<ext>
      for (const { suffix, lineSuffix } of LOCALES) {
        const re = new RegExp(`_${suffix}\\.(png|jpg|jpeg|webp)$`, "i");
        if (re.test(f.name)) {
          localeFiles.push({ ...f, suffix, lineSuffix });
          break;
        }
      }
    }

    if (localeFiles.length === 0) continue;

    console.log(`━━━ ${line.name} (${localeFiles.length} locale file(s) to move) ━━━`);

    // Group by locale
    const byLocale = new Map();
    for (const f of localeFiles) {
      if (!byLocale.has(f.lineSuffix)) byLocale.set(f.lineSuffix, []);
      byLocale.get(f.lineSuffix).push(f);
    }

    for (const [lineSuffix, files] of byLocale) {
      let targetFolderId;
      try {
        targetFolderId = await resolveLocaleDsImagesFolder(
          line.ds_images_folder_id,
          line.name,
          lineSuffix,
          EXECUTE,
        );
      } catch (err) {
        console.log(`  ⚠ ${lineSuffix}: ${err.message}`);
        continue;
      }

      console.log(`  → ${line.name}_${lineSuffix}/DS Images (${files.length} files)`);
      for (const f of files) {
        console.log(`     📄 ${f.name}`);
        if (EXECUTE) {
          try {
            const removeParent = f.parents?.[0];
            await drive.files.update({
              fileId: f.id,
              addParents: targetFolderId,
              removeParents: removeParent,
              supportsAllDrives: true,
              fields: "id, parents",
            });
            totalMoves++;
          } catch (err) {
            console.log(`        ❌ move failed: ${err instanceof Error ? err.message : err}`);
          }
        } else {
          totalMoves++;
        }
      }
    }
    console.log();
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total: ${totalMoves} file(s) ${EXECUTE ? "moved" : "would be moved"}`);
  if (!EXECUTE && totalMoves > 0) {
    console.log(`\nDry run. Re-run with --execute to actually move.`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
