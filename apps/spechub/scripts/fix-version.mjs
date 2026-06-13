// Fix a product's version number across all stores:
//   DB products.current_version + current_versions
//   DB versions table
//   Supabase Storage filename
//   Google Drive filename
//
// Usage:
//   node scripts/fix-version.mjs ECC120Z 1.1 1.0          # dry-run
//   node scripts/fix-version.mjs ECC120Z 1.1 1.0 --execute

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const [model, fromVer, toVer] = process.argv.slice(2);
const EXECUTE = process.argv.includes("--execute");

if (!model || !fromVer || !toVer) {
  console.error("Usage: node scripts/fix-version.mjs <MODEL> <FROM_VER> <TO_VER> [--execute]");
  console.error("  e.g. node scripts/fix-version.mjs ECC120Z 1.1 1.0 --execute");
  process.exit(1);
}

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

(async () => {
  console.log(`Model:   ${model}`);
  console.log(`Version: v${fromVer} → v${toVer}`);
  console.log(`Mode:    ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

  // 1. Find product
  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, current_version, current_versions, product_line_id")
    .eq("model_name", model)
    .single();

  if (pErr || !product) {
    console.error(`Product "${model}" not found`);
    process.exit(1);
  }

  const { data: line } = await supabase
    .from("product_lines")
    .select("ds_prefix, drive_folder_id")
    .eq("id", product.product_line_id)
    .single();

  const dsPrefix = line?.ds_prefix ?? "DS_Cloud";
  const currentVersions = (product.current_versions ?? {});

  console.log("━━━ 1. DB: products table ━━━");
  console.log(`  current_version:  ${product.current_version} → ${toVer}`);
  const newVersions = { ...currentVersions, en: toVer };
  console.log(`  current_versions: ${JSON.stringify(currentVersions)} → ${JSON.stringify(newVersions)}`);

  if (EXECUTE) {
    await supabase
      .from("products")
      .update({ current_version: toVer, current_versions: newVersions })
      .eq("id", product.id);
    console.log("  ✅ updated\n");
  } else {
    console.log("  (dry run)\n");
  }

  // 2. versions table
  console.log("━━━ 2. DB: versions table ━━━");
  const { data: versionRows } = await supabase
    .from("versions")
    .select("id, version, locale, pdf_storage_path, changes")
    .eq("product_id", product.id)
    .eq("version", fromVer)
    .eq("locale", "en");

  if (!versionRows || versionRows.length === 0) {
    console.log(`  No version record found for v${fromVer} (en)\n`);
  } else {
    for (const row of versionRows) {
      const oldPath = row.pdf_storage_path || "";
      const newPath = oldPath.replace(`_v${fromVer}`, `_v${toVer}`);
      console.log(`  id: ${row.id}`);
      console.log(`  version: ${row.version} → ${toVer}`);
      console.log(`  pdf_storage_path: ${oldPath}`);
      console.log(`                  → ${newPath}`);

      if (EXECUTE) {
        await supabase
          .from("versions")
          .update({
            version: toVer,
            pdf_storage_path: newPath,
            changes: (row.changes || "").replace(`v${fromVer}`, `v${toVer}`),
          })
          .eq("id", row.id);
        console.log("  ✅ updated\n");
      } else {
        console.log("  (dry run)\n");
      }
    }
  }

  // 3. Supabase Storage
  console.log("━━━ 3. Supabase Storage ━━━");
  const oldFileName = `${dsPrefix}_${model}_v${fromVer}.pdf`;
  const newFileName = `${dsPrefix}_${model}_v${toVer}.pdf`;
  const oldStoragePath = `${model}/${oldFileName}`;
  const newStoragePath = `${model}/${newFileName}`;

  const { data: storageList } = await supabase.storage
    .from("datasheets")
    .list(model);

  const found = (storageList ?? []).find(f => f.name === oldFileName);
  if (found) {
    console.log(`  Found: ${oldStoragePath}`);
    console.log(`      →  ${newStoragePath}`);

    if (EXECUTE) {
      // Storage doesn't support rename — download + re-upload + delete old
      const { data: blob } = await supabase.storage
        .from("datasheets")
        .download(oldStoragePath);

      if (blob) {
        const buffer = Buffer.from(await blob.arrayBuffer());
        await supabase.storage
          .from("datasheets")
          .upload(newStoragePath, buffer, { contentType: "application/pdf", upsert: true });
        await supabase.storage
          .from("datasheets")
          .remove([oldStoragePath]);
        console.log("  ✅ renamed (download → upload → delete)\n");
      } else {
        console.log("  ❌ download failed\n");
      }
    } else {
      console.log("  (dry run)\n");
    }
  } else {
    console.log(`  File ${oldFileName} not found in storage bucket\n`);
  }

  // 4. Google Drive
  console.log("━━━ 4. Google Drive ━━━");
  if (!line?.drive_folder_id) {
    console.log("  No drive_folder_id configured\n");
  } else {
    // Search for the old PDF filename across the Drive folder tree
    const res = await drive.files.list({
      q: `name = '${oldFileName}' and trashed = false`,
      fields: "files(id, name, parents)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 10,
    });

    const driveFiles = res.data.files ?? [];
    if (driveFiles.length === 0) {
      console.log(`  File ${oldFileName} not found in Drive\n`);
    } else {
      for (const f of driveFiles) {
        console.log(`  📄 ${f.name} (id: ${f.id})`);
        console.log(`     → ${newFileName}`);

        if (EXECUTE) {
          await drive.files.update({
            fileId: f.id,
            requestBody: { name: newFileName },
            supportsAllDrives: true,
          });
          console.log("  ✅ renamed");
        } else {
          console.log("  (dry run)");
        }
      }
      console.log();
    }

    // Also rename the Drive folder if it contains the version
    const oldFolderName = `${dsPrefix}_${model}_v${fromVer}`;
    const newFolderName = `${dsPrefix}_${model}_v${toVer}`;
    const folderRes = await drive.files.list({
      q: `name = '${oldFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 5,
    });

    const folders = folderRes.data.files ?? [];
    if (folders.length > 0) {
      for (const f of folders) {
        console.log(`  📁 ${f.name} → ${newFolderName}`);
        if (EXECUTE) {
          await drive.files.update({
            fileId: f.id,
            requestBody: { name: newFolderName },
            supportsAllDrives: true,
          });
          console.log("  ✅ renamed");
        } else {
          console.log("  (dry run)");
        }
      }
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (!EXECUTE) {
    console.log("Dry run complete. Re-run with --execute to apply.");
  } else {
    console.log(`✅ All done. ${model} is now v${toVer}.`);
    console.log(`   Regenerate PDF to update the footer version.`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
