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

/**
 * Map locale codes to Drive folder suffixes.
 * e.g. "zh-TW" → "zh" (shorter, matching existing convention)
 */
const LOCALE_FOLDER_SUFFIX: Record<string, string> = {
  "zh-TW": "zh",
  // ja stays as "ja", add more mappings as needed
};

export function getLocaleSuffix(locale: string): string {
  return LOCALE_FOLDER_SUFFIX[locale] ?? locale;
}

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

    // Check 2: Version in PDF file names inside the folder
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

    // Check 3: Version subfolders inside the model folder
    // e.g. DS_Cloud_ECC100/ → DS_Cloud_ECC100_v1.0/ , DS_Cloud_ECC100_v1.1/
    try {
      const subFoldersRes = await drive.files.list({
        q: `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${modelName}' and trashed = false`,
        fields: "files(id, name)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 50,
      });

      for (const sub of subFoldersRes.data.files ?? []) {
        if (!sub.name || !sub.id) continue;
        // Check version in subfolder name
        const subVer = parseVersion(sub.name);
        if (subVer && (!best || compareVersions(subVer, best) > 0)) {
          best = {
            version: `${subVer.major}.${subVer.minor}`,
            major: subVer.major,
            minor: subVer.minor,
            folderId: sub.id,
            folderName: sub.name,
          };
        }

        // Also check PDFs inside the subfolder
        try {
          const subFilesRes = await drive.files.list({
            q: `'${sub.id}' in parents and mimeType = 'application/pdf' and name contains '${modelName}' and trashed = false`,
            fields: "files(name)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            pageSize: 20,
          });

          for (const sf of subFilesRes.data.files ?? []) {
            if (!sf.name) continue;
            const sfVer = parseVersion(sf.name);
            if (sfVer && (!best || compareVersions(sfVer, best) > 0)) {
              best = {
                version: `${sfVer.major}.${sfVer.minor}`,
                major: sfVer.major,
                minor: sfVer.minor,
                folderId: sub.id,
                folderName: sub.name,
              };
            }
          }
        } catch { /* skip */ }
      }
    } catch {
      // Skip if we can't list subfolders
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
 * Detect the latest version of a localized datasheet from Google Drive.
 *
 * Scans for locale-specific folders like: DS_Cloud_ECC100_ja/
 * Then checks PDF filenames inside for version numbers.
 *
 * @param driveFolderId - Product line's parent Drive folder ID
 * @param dsPrefix - Filename prefix (e.g. "DS_Cloud")
 * @param modelName - Product model name (e.g. "ECC100")
 * @param locale - Language code (e.g. "ja", "zh-TW")
 */
export async function detectLocaleVersion(
  driveFolderId: string,
  dsPrefix: string,
  modelName: string,
  locale: string
): Promise<VersionInfo | null> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  // Search for locale-specific folder: DS_Cloud_ECC100_ja
  const localeFolderName = `${dsPrefix}_${modelName}_${getLocaleSuffix(locale)}`;

  const foldersRes = await drive.files.list({
    q: `'${driveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${localeFolderName}' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });

  const folder = foldersRes.data.files?.[0];
  if (!folder?.id) return null;

  // Scan PDFs inside the locale folder for version numbers
  let best: VersionInfo | null = null;

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
          folderName: folder.name!,
        };
      }
    }
  } catch {
    // Skip if we can't list files
  }

  // If no versioned PDFs found but folder exists, assume it has content
  if (!best && folder.id) {
    best = {
      version: "1.0",
      major: 1,
      minor: 0,
      folderId: folder.id,
      folderName: folder.name!,
    };
  }

  return best;
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
  driveFolderId: string,        // EN product line folder
  dsPrefix: string,
  modelName: string,
  version: string,
  pdfBuffer: Buffer,
  existingVersion: VersionInfo | null,
  locale?: string,
  lineName?: string,            // required for locale uploads (e.g. "Cloud Camera")
): Promise<{ fileId: string; webViewLink: string }> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  // Filename: ALWAYS use getLocaleSuffix() so zh-TW renders as _zh, not
  // _zh-TW. The earlier bug used raw `locale`, producing _zh-TW.pdf
  // which mismatched both the doc convention and the storage path.
  const localeSuffix = locale ? getLocaleSuffix(locale) : null;
  const langSuffix = localeSuffix ? `_${localeSuffix}` : "";
  const pdfFileName = `${dsPrefix}_${modelName}_v${version}${langSuffix}.pdf`;

  // For locale uploads, parent must be the SIBLING locale line folder
  // (e.g. "Cloud Camera_zh"), not the EN line. Earlier bug used EN
  // directly so locale PDFs ended up nested under the wrong parent.
  let parentLineFolderId = driveFolderId;
  if (locale && locale !== "en") {
    if (!lineName) {
      throw new Error(
        `uploadPdfToDrive: locale=${locale} requires lineName to resolve sibling folder`,
      );
    }
    // Lazy-import to avoid circular dependency between drive-images and
    // drive-versions. resolveLocaleLineFolder lives in drive-images.
    const { resolveLocaleLineFolder } = await import("./drive-images");
    parentLineFolderId = await resolveLocaleLineFolder({
      enLineFolderId: driveFolderId,
      lineName,
      locale,
    });
  }

  // Subfolder per model. Per docs/drive-folder-and-naming-rules.html:
  //   EN:     <Line>/DS_Cloud_<model>/
  //   Locale: <Line>_<suffix>/DS_Cloud_<model>_<suffix>/
  const targetFolderName = localeSuffix
    ? `${dsPrefix}_${modelName}_${localeSuffix}`
    : `${dsPrefix}_${modelName}`;

  let targetFolderId: string;
  const existingFolderRes = await drive.files.list({
    q: `'${parentLineFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${targetFolderName}' and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });
  const existingFolder = existingFolderRes.data.files?.[0];
  if (existingFolder?.id) {
    targetFolderId = existingFolder.id;
  } else {
    // No canonical folder. Look for a legacy version-suffixed folder
    // (`DS_Cloud_ECC100_zh_v1.0/`) created by hand in the early days
    // before this system existed. If we find any, rename the highest
    // version one to canonical and reuse it — that way old PDFs stay
    // in place + the folder name migrates to the new convention.
    //
    // We look up via Drive search rather than relying on the caller's
    // existingVersion (which only resolves EN). This way both locale
    // and EN benefit from the same migration.
    const legacyRes = await drive.files.list({
      q: `'${parentLineFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${targetFolderName}_v' and trashed = false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 50,
    });
    const legacyRe = new RegExp(
      `^${targetFolderName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_v(\\d+)\\.(\\d+)$`,
    );
    const legacyMatches = (legacyRes.data.files ?? [])
      .map((f) => {
        const m = f.name?.match(legacyRe);
        return m && f.id
          ? { id: f.id, name: f.name!, major: +m[1], minor: +m[2] }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) =>
        a.major !== b.major ? b.major - a.major : b.minor - a.minor,
      );

    if (legacyMatches.length > 0) {
      const newest = legacyMatches[0];
      console.info(
        `[drive] Migrating legacy folder "${newest.name}" → "${targetFolderName}" (and reusing for new PDF).`,
      );
      try {
        await drive.files.update({
          fileId: newest.id,
          requestBody: { name: targetFolderName },
          supportsAllDrives: true,
        });
        targetFolderId = newest.id;
      } catch (err) {
        console.warn(
          `[drive] Legacy folder rename failed (${err instanceof Error ? err.message : String(err)}); creating fresh canonical folder instead.`,
        );
        targetFolderId = "";
      }
    } else if (!locale && existingVersion) {
      // EN-only fallback retained for callers that already detected the
      // old-format folder via detectLatestVersion(). Skip if we already
      // migrated above.
      targetFolderId = existingVersion.folderId;
    } else {
      targetFolderId = "";
    }

    if (!targetFolderId) {
      const folderRes = await drive.files.create({
        requestBody: {
          name: targetFolderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentLineFolderId],
        },
        supportsAllDrives: true,
        fields: "id",
      });
      targetFolderId = folderRes.data.id!;
    }
  }

  // Upload PDF — overwrite existing same-name file, dedupe extras.
  // Drive allows multiple files in the same folder with identical names,
  // so prior `files.create` calls accumulated copies on every Regenerate.
  const sameNameRes = await drive.files.list({
    q: `'${targetFolderId}' in parents and name = '${pdfFileName}' and trashed = false`,
    fields: "files(id, modifiedTime)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    orderBy: "createdTime",
    pageSize: 100,
  });
  const sameNameFiles = sameNameRes.data.files ?? [];

  if (sameNameFiles.length > 0) {
    // Keep the first (oldest) one, trash duplicates, then update content.
    // Use trash, not hard delete: service accounts in Shared Drives often
    // have canTrash=true but canDelete=false. files.delete then 404s on
    // permission denial. Trashing is reversible and always works.
    const [keep, ...dupes] = sameNameFiles;
    for (const d of dupes) {
      if (d.id) {
        try {
          await drive.files.update({
            fileId: d.id,
            requestBody: { trashed: true },
            supportsAllDrives: true,
          });
        } catch (err) {
          console.warn(
            `[drive] Failed to trash duplicate PDF ${d.id}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }
    if (dupes.length > 0) {
      console.info(
        `[drive] Cleaned up ${dupes.length} duplicate "${pdfFileName}" in target folder.`,
      );
    }
    const updateRes = await drive.files.update({
      fileId: keep.id!,
      media: {
        mimeType: "application/pdf",
        body: Readable.from(pdfBuffer),
      },
      supportsAllDrives: true,
      fields: "id, webViewLink",
    });
    return {
      fileId: updateRes.data.id!,
      webViewLink: updateRes.data.webViewLink ?? "",
    };
  }

  // No existing file — create fresh.
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
