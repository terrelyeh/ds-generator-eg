// Inspect the contents of the "keeper" DS_Cloud_ECC100 folder that the
// cleanup script would preserve. Shows every file inside so we can verify
// this is the right folder before trashing duplicates.

import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const credentials = JSON.parse(
  SA_JSON.startsWith("{") ? SA_JSON : Buffer.from(SA_JSON, "base64").toString("utf8"),
);
const auth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

// Find all DS_Cloud_ECC100 folders, show contents of each
const res = await drive.files.list({
  q: `mimeType = 'application/vnd.google-apps.folder' and name = 'DS_Cloud_ECC100' and trashed = false`,
  fields: "files(id, name, modifiedTime, createdTime)",
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  pageSize: 100,
});

const folders = res.data.files ?? [];
console.log(`Found ${folders.length} folder(s) named 'DS_Cloud_ECC100'\n`);

// Enrich and sort by fileCount desc, then modifiedTime desc
const enriched = await Promise.all(
  folders.map(async (f) => {
    const filesRes = await drive.files.list({
      q: `'${f.id}' in parents and trashed = false`,
      fields: "files(id, name, size, modifiedTime, createdTime)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 100,
      orderBy: "name",
    });
    return { ...f, files: filesRes.data.files ?? [] };
  }),
);

enriched.sort((a, b) => {
  if (b.files.length !== a.files.length) return b.files.length - a.files.length;
  return new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime();
});

for (let i = 0; i < enriched.length; i++) {
  const f = enriched[i];
  const marker = i === 0 ? "✅ KEEPER" : "🗑  trash";
  console.log(`${marker}  ${f.id}`);
  console.log(`         created=${f.createdTime}  modified=${f.modifiedTime}  files=${f.files.length}`);
  for (const file of f.files) {
    const sizeKB = file.size ? `${Math.round(parseInt(file.size) / 1024)}KB`.padStart(8) : "       -";
    console.log(`         📄 ${file.name.padEnd(48)} ${sizeKB}  ${file.modifiedTime}`);
  }
  console.log();
}
