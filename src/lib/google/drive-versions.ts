import { google } from "googleapis";
import { Readable } from "stream";
import { getGoogleAuth } from "./auth";

/**
 * Google Drive version detection & PDF upload for datasheets.
 *
 * Folder structure (existing):
 *   Cloud AP/
 *     DS_Cloud_ECW526_v1.4/        ← old format: version in folder name
 *       DS_Cloud_ECW526_v1.4.pdf
 *       DS_Cloud_ECW526_v1.4.indd
 *     DS_Cloud_ECW520/              ← new format: no version in folder name
 *       DS_Cloud_ECW520_v1.1.pdf
 *       DS_Cloud_ECW520_v1.2.pdf
 *
 * Naming rule:
 *   Folder:  {prefix}_{model}[_v{version}]/
 *   PDF:     {prefix}_{model}_v{version}.pdf
 */

interface VersionInfo {
  version: string; // e.g. "1.4"
  major: number;
  minor: number;
  folderId: string; // Drive folder ID containing the latest version
  folderName: string;
}

/**
 * Parse version string from a folder or file name.
 * Matches patterns like: _v1.4, _v2.0, _v1.10
 */
function parseVersion(name: string): { major: number; minor: number } | null {
  const match = name.match(/_v(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: parseInt(match[1]), minor: parseInt(match[2]) };
}

/**
 * Compare two versions. Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareVersions(
  a: { major: number; minor: number },
  b: { major: number; minor: number }
): number {
  if (a.major !== b.major) return a.major - b.major;
  return a.minor - b.minor;
}

/**
 * Detect the latest version of a model's datasheet from Google Drive.
 *
 * Scans the product line's Drive folder for subfolders matching the model,
 * then checks both folder names and PDF file names for version numbers.
 *
 * @param driveFolderId - Product line's parent Drive folder ID
 * @param dsPrefix - Filename prefix (e.g. "DS_Cloud", "DS_Unmanaged")
 * @param modelName - Product model name (e.g. "ECW526")
 * @returns Latest version info, or null if no existing version found
 */
export async function detectLatestVersion(
  driveFolderId: string,
  dsPrefix: string,
  modelName: string
): Promise<VersionInfo | null> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  // Search for subfolders containing the model name
  const folderQuery = `'${driveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${modelName}' and trashed = false`;

  const foldersRes = await drive.files.list({
    q: folderQuery,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 50,
  });

  const folders = foldersRes.data.files ?? [];
  if (folders.length === 0) return null;

  let best: VersionInfo | null = null;

  for (const folder of folders) {
    if (!folder.id || !folder.name) continue;

    // Verify folder name matches exactly:
    // {prefix}_{model} or {prefix}_{model}_v{version}
    // Must NOT match longer model names (e.g. ECC500 should not match ECC500Z)
    const expectedBase = `${dsPrefix}_${modelName}`;
    if (!folder.name.startsWith(expectedBase)) continue;
    const remainder = folder.name.slice(expectedBase.length);
    // After the base, only allow: "" (exact), "_v..." (versioned), or nothing else
    if (remainder !== "" && !remainder.startsWith("_v")) continue;

    // Check 1: Version in folder name (old format)
    const folderVer = parseVersion(folder.name);
    if (folderVer) {
      if (!best || compareVersions(folderVer, best) > 0) {
        best = {
          version: `${folderVer.major}.${folderVer.minor}`,
          major: folderVer.major,
          minor: folderVer.minor,
          folderId: folder.id,
          folderName: folder.name,
        };
      }
    }

    // Check 2: Version in PDF file names inside the folder (both formats)
    try {
      const filesRes = await drive.files.list({
        q: `'${folder.id}' in parents and mimeType = 'application/pdf' and name contains '${modelName}' and trashed = false`,
        fields: "files(name)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 50,
      });

      for (const file of filesRes.data.files ?? []) {
        if (!file.name) continue;
        const fileVer = parseVersion(file.name);
        if (fileVer && (!best || compareVersions(fileVer, best) > 0)) {
          best = {
            version: `${fileVer.major}.${fileVer.minor}`,
            major: fileVer.major,
            minor: fileVer.minor,
            folderId: folder.id,
            folderName: folder.name,
          };
        }
      }
    } catch {
      // Skip if we can't list files in this folder
    }
  }

  return best;
}

/**
 * Calculate the next version number.
 * Increments the minor version by 1 (e.g. 1.4 → 1.5).
 */
export function bumpVersion(current: VersionInfo | null): string {
  if (!current) return "1.0";
  return `${current.major}.${current.minor + 1}`;
}

/**
 * Upload a generated PDF to Google Drive.
 *
 * For old-format folders (with version in name), creates a new folder.
 * For new-format folders (without version), uploads into the existing folder.
 * If no folder exists for this model, creates a new one (new format).
 *
 * @returns The Google Drive file ID and web view link of the uploaded PDF
 */
export async function uploadPdfToDrive(
  driveFolderId: string,
  dsPrefix: string,
  modelName: string,
  version: string,
  pdfBuffer: Buffer,
  existingVersion: VersionInfo | null
): Promise<{ fileId: string; webViewLink: string }> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const pdfFileName = `${dsPrefix}_${modelName}_v${version}.pdf`;

  let targetFolderId: string;

  if (existingVersion) {
    const folderHasVersion = parseVersion(existingVersion.folderName) !== null;

    if (folderHasVersion) {
      // Old format folder (e.g. DS_Cloud_ECW526_v1.4/) — upload to same folder
      // The old version PDF stays, new one is added alongside it
      targetFolderId = existingVersion.folderId;
    } else {
      // New format folder (e.g. DS_Cloud_ECW526/) — upload into it
      targetFolderId = existingVersion.folderId;
    }
  } else {
    // No existing folder — create new one (new format, no version in name)
    const newFolderName = `${dsPrefix}_${modelName}`;
    const folderRes = await drive.files.create({
      requestBody: {
        name: newFolderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [driveFolderId],
      },
      supportsAllDrives: true,
      fields: "id",
    });

    targetFolderId = folderRes.data.id!;
  }

  // Upload the PDF
  const fileRes = await drive.files.create({
    requestBody: {
      name: pdfFileName,
      parents: [targetFolderId],
    },
    media: {
      mimeType: "application/pdf",
      body: Readable.from(pdfBuffer),
    },
    supportsAllDrives: true,
    fields: "id, webViewLink",
  });

  return {
    fileId: fileRes.data.id!,
    webViewLink: fileRes.data.webViewLink ?? "",
  };
}
