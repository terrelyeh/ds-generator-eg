// One-off cleanup for PDFs that landed in the wrong Drive location due to
// the bugs fixed in this commit:
//
//   - DS_Cloud_<model>_<suffix>/ subfolders ended up nested inside the EN
//     product line folder (e.g. Cloud Camera/DS_Cloud_ECC120Z_zh/) instead
//     of the sibling locale line folder (Cloud Camera_zh/DS_Cloud_ECC120Z_zh/)
//   - PDF filenames inside used the raw locale (`_zh-TW.pdf`) instead of
//     the canonical short suffix (`_zh.pdf`)
//   - Every Regenerate added a new copy instead of overwriting, so each
//     misplaced folder typically has 2-4 duplicate PDFs
//
// What this script does for every product line with a locale-enabled
// model subfolder:
//   1. Finds misplaced `<dsPrefix>_<model>_<suffix>/` subfolders under
//      the EN product line folder
//   2. Resolves (or auto-creates) the canonical sibling line folder
//   3. Moves the misplaced subfolder into the sibling
//   4. Inside the moved subfolder: dedupes by canonical filename
//      (newest wins, rest deleted), renames `_<rawLocale>.pdf` →
//      `_<canonicalSuffix>.pdf`
//
// DRY RUN by default. Pass --execute to actually move/delete.
//
// Usage:
//   node scripts/cleanup-misplaced-locale-pdfs.mjs            # dry run
//   node scripts/cleanup-misplaced-locale-pdfs.mjs --execute  # do it

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.env.local",
  ),
});

const EXECUTE = process.argv.includes("--execute");

// locale code (used in DB / Sheet) → canonical suffix (used in Drive folder
// names and PDF filenames). Mirror of getLocaleSuffix() in drive-versions.ts
const LOCALES = [
  { code: "ja", suffix: "ja" },
  { code: "zh-TW", suffix: "zh" },
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GOOGLE_KEY) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GOOGLE_SERVICE_ACCOUNT_JSON",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Google service account auth — mirrors lib/google/auth.ts
const sa = JSON.parse(
  Buffer.from(GOOGLE_KEY, "base64").toString("utf-8"),
);
const jwt = new JWT({
  email: sa.client_email,
  key: sa.private_key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth: jwt });

// ---------------------------------------------------------------------------

async function listSubfolders(parentId) {
  const all = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
      pageSize: 200,
    });
    all.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return all;
}

async function listChildren(parentId) {
  const all = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
      pageSize: 200,
    });
    all.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return all;
}

async function findFolderByName(parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function getRootFolderId(enLineFolderId) {
  const res = await drive.files.get({
    fileId: enLineFolderId,
    fields: "parents",
    supportsAllDrives: true,
  });
  const root = res.data.parents?.[0];
  if (!root) {
    throw new Error(`EN line folder ${enLineFolderId} has no parent`);
  }
  return root;
}

async function ensureLocaleLineFolder({ rootId, lineName, suffix, locale }) {
  const canonical = `${lineName}_${suffix}`;
  // Try canonical, then a few PM-typo variants
  const candidates = [
    canonical,
    `${lineName}_${locale}`,
    `${lineName}_${locale.replace("-", "_")}`,
    `${lineName}_${suffix.toUpperCase()}`,
    locale === "ja" ? `${lineName}_jp` : null,
  ].filter(Boolean);

  for (const name of candidates) {
    const id = await findFolderByName(rootId, name);
    if (id) {
      if (name !== canonical) {
        console.warn(
          `   ⚠️  Found "${name}" instead of canonical "${canonical}" — using as-is`,
        );
      }
      return id;
    }
  }

  console.log(`   ➕ Creating "${canonical}"`);
  if (!EXECUTE) return "(dry-run-id)";
  const res = await drive.files.create({
    requestBody: {
      name: canonical,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootId],
    },
    supportsAllDrives: true,
    fields: "id",
  });
  return res.data.id;
}

async function moveFolder(folderId, oldParentId, newParentId) {
  if (!EXECUTE) return;
  await drive.files.update({
    fileId: folderId,
    addParents: newParentId,
    removeParents: oldParentId,
    supportsAllDrives: true,
    fields: "id, parents",
  });
}

async function renameFile(fileId, newName) {
  if (!EXECUTE) return;
  await drive.files.update({
    fileId,
    requestBody: { name: newName },
    supportsAllDrives: true,
  });
}

async function deleteFile(fileId) {
  if (!EXECUTE) return;
  // Use trash, not hard delete. Service accounts in Shared Drives often
  // have canTrash=true but canDelete=false — Drive returns 404 (which
  // looks like "not found") on `files.delete` when really it's a
  // permission denial. Trashing always works for us and is reversible.
  try {
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
  } catch (err) {
    if (err?.code === 404 || err?.status === 404) {
      console.log(`         (already gone, skipping)`);
      return;
    }
    throw err;
  }
}

function canonicalisePdfName(name, suffix) {
  // DS_Cloud_ECC120Z_v1.0_zh-TW.pdf  → DS_Cloud_ECC120Z_v1.0_zh.pdf
  // DS_Cloud_ECC120Z_v1.0_zh_TW.pdf  → DS_Cloud_ECC120Z_v1.0_zh.pdf
  // DS_Cloud_ECC120Z_v1.0_jp.pdf     → DS_Cloud_ECC120Z_v1.0_ja.pdf (ja suffix)
  // Heuristic: strip any locale suffix between version and .pdf, replace
  // with canonical. Match `_<anything>.pdf` after a `_v\d+\.\d+`.
  const m = name.match(/^(.+_v\d+\.\d+)(?:_[^.]+)?(\.pdf)$/i);
  if (!m) return name;
  return `${m[1]}_${suffix}${m[2]}`;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `\n${EXECUTE ? "🚀 EXECUTE MODE" : "🧪 DRY RUN"} — cleanup misplaced locale PDFs\n`,
  );

  // Pull all product lines that have a Drive folder.
  const { data: lines, error } = await supabase
    .from("product_lines")
    .select("id, name, drive_folder_id, ds_prefix")
    .not("drive_folder_id", "is", null);
  if (error) throw error;

  let totalMoved = 0;
  let totalDeduped = 0;
  let totalRenamed = 0;

  for (const line of lines ?? []) {
    const enLineFolderId = line.drive_folder_id;
    const dsPrefix = line.ds_prefix ?? "DS_Cloud";
    console.log(`\n📂 ${line.name} (${enLineFolderId})`);

    let rootId;
    try {
      rootId = await getRootFolderId(enLineFolderId);
    } catch (err) {
      console.warn(`   skip: ${err.message}`);
      continue;
    }

    // Look for misplaced subfolders inside the EN line.
    const enChildren = await listSubfolders(enLineFolderId);

    for (const { code: locale, suffix } of LOCALES) {
      // Match `<dsPrefix>_<model>_<suffix>` (and a couple PM variants)
      const localeFolderRe = new RegExp(
        `^${dsPrefix}_(.+)_(${suffix}|${locale.replace("-", "[-_]")}|${locale}|${suffix.toUpperCase()})$`,
      );
      const misplaced = enChildren.filter((f) =>
        localeFolderRe.test(f.name ?? ""),
      );
      if (misplaced.length === 0) continue;

      console.log(
        `   📍 Found ${misplaced.length} misplaced ${locale} subfolder(s) under EN line:`,
      );
      for (const folder of misplaced) {
        console.log(`      - ${folder.name}`);
      }

      const localeLineId = await ensureLocaleLineFolder({
        rootId,
        lineName: line.name,
        suffix,
        locale,
      });

      for (const folder of misplaced) {
        const canonicalSubfolderName = folder.name.replace(
          localeFolderRe,
          `${dsPrefix}_$1_${suffix}`,
        );

        // Check if a folder with the canonical name already exists at
        // the destination — if yes, merge into it; else just move.
        const existingAtDest = await findFolderByName(
          localeLineId,
          canonicalSubfolderName,
        );
        let targetFolderId;

        if (existingAtDest) {
          console.log(
            `      → "${canonicalSubfolderName}" already exists at destination; merging files into it.`,
          );
          targetFolderId = existingAtDest;
          // Move every file from the misplaced folder into the
          // existing destination folder, then trash the empty
          // misplaced folder.
          const filesInMisplaced = await listChildren(folder.id);
          for (const file of filesInMisplaced) {
            console.log(`         move ${file.name}`);
            if (EXECUTE) {
              await drive.files.update({
                fileId: file.id,
                addParents: targetFolderId,
                removeParents: folder.id,
                supportsAllDrives: true,
                fields: "id, parents",
              });
            }
          }
          if (EXECUTE) await deleteFile(folder.id);
          totalMoved += 1;
        } else {
          // Rename the folder to canonical (in case the regex matched a
          // PM-variant) and move it under the locale line.
          if (folder.name !== canonicalSubfolderName) {
            console.log(
              `      → renaming "${folder.name}" → "${canonicalSubfolderName}"`,
            );
            if (EXECUTE) {
              await drive.files.update({
                fileId: folder.id,
                requestBody: { name: canonicalSubfolderName },
                supportsAllDrives: true,
              });
            }
          }
          console.log(
            `      → moving "${canonicalSubfolderName}" → "${line.name}_${suffix}/"`,
          );
          await moveFolder(folder.id, enLineFolderId, localeLineId);
          targetFolderId = folder.id;
          totalMoved += 1;
        }

        // Inside the now-correctly-placed folder: dedupe + rename PDFs
        const filesInTarget = EXECUTE
          ? await listChildren(targetFolderId)
          : await listChildren(folder.id); // best effort during dry-run
        const pdfs = filesInTarget.filter((f) =>
          /\.pdf$/i.test(f.name ?? ""),
        );

        // Group by canonical name → newest wins
        const groups = new Map();
        for (const pdf of pdfs) {
          const canonicalName = canonicalisePdfName(pdf.name ?? "", suffix);
          const arr = groups.get(canonicalName) ?? [];
          arr.push(pdf);
          groups.set(canonicalName, arr);
        }

        for (const [canonicalName, group] of groups) {
          // Sort newest first
          group.sort((a, b) => {
            const ta = a.modifiedTime ?? "";
            const tb = b.modifiedTime ?? "";
            return tb.localeCompare(ta);
          });
          const [keep, ...dupes] = group;

          // Rename keep if its name isn't canonical
          if (keep.name !== canonicalName) {
            console.log(
              `         rename ${keep.name} → ${canonicalName}`,
            );
            await renameFile(keep.id, canonicalName);
            totalRenamed += 1;
          }
          for (const d of dupes) {
            console.log(`         delete duplicate ${d.name} (id=${d.id})`);
            await deleteFile(d.id);
            totalDeduped += 1;
          }
        }
      }
    }
  }

  // Second pass: walk the (possibly already-correctly-placed) locale line
  // folders and dedupe / rename PDFs inside their model subfolders. Catches
  // leftover bad data from interrupted earlier runs.
  console.log("\n--- Pass 2: dedupe inside locale line folders ---");
  for (const line of lines ?? []) {
    let rootId;
    try {
      rootId = await getRootFolderId(line.drive_folder_id);
    } catch {
      continue;
    }
    for (const { code: locale, suffix } of LOCALES) {
      const localeLineId = await findFolderByName(
        rootId,
        `${line.name}_${suffix}`,
      );
      if (!localeLineId) continue;
      const subfolders = await listSubfolders(localeLineId);
      const dsPrefix = line.ds_prefix ?? "DS_Cloud";
      const subRe = new RegExp(`^${dsPrefix}_.+_${suffix}$`);
      for (const sub of subfolders) {
        if (!subRe.test(sub.name)) continue;
        const files = await listChildren(sub.id);
        const pdfs = files.filter((f) => /\.pdf$/i.test(f.name ?? ""));
        if (pdfs.length === 0) continue;

        const groups = new Map();
        for (const pdf of pdfs) {
          const canonical = canonicalisePdfName(pdf.name ?? "", suffix);
          const arr = groups.get(canonical) ?? [];
          arr.push(pdf);
          groups.set(canonical, arr);
        }
        for (const [canonicalName, group] of groups) {
          if (group.length === 1 && group[0].name === canonicalName) continue;
          group.sort((a, b) =>
            (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""),
          );
          const [keep, ...dupes] = group;
          if (keep.name !== canonicalName) {
            console.log(
              `   ${line.name}_${suffix}/${sub.name}: rename ${keep.name} → ${canonicalName}`,
            );
            await renameFile(keep.id, canonicalName);
            totalRenamed += 1;
          }
          for (const d of dupes) {
            console.log(
              `   ${line.name}_${suffix}/${sub.name}: delete duplicate ${d.name}`,
            );
            await deleteFile(d.id);
            totalDeduped += 1;
          }
        }
      }
    }
  }

  console.log("\n──────────────────────────");
  console.log(
    `Summary: moved ${totalMoved} folder(s), deduped ${totalDeduped} file(s), renamed ${totalRenamed} file(s).`,
  );
  if (!EXECUTE) {
    console.log("\nThis was a DRY RUN. Re-run with --execute to apply.\n");
  } else {
    console.log("\n✅ Done.\n");
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
