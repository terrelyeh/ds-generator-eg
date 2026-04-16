import { google } from "googleapis";
import { Readable } from "stream";
import { getGoogleAuth } from "./auth";
import { getLocaleSuffix } from "./drive-versions";

const DS_IMAGES_FOLDER_NAME = "DS Images";

/**
 * Find a file by exact name within a specific Google Drive folder.
 * Returns the Drive file ID and mimeType, or null if not found.
 */
interface DriveFileInfo {
  id: string;
  mimeType: string;
  modifiedTime?: string;
}

async function findFileInFolder(
  folderId: string,
  fileName: string
): Promise<DriveFileInfo | null> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and name = '${fileName}' and mimeType contains 'image/' and trashed = false`,
    fields: "files(id, name, mimeType, modifiedTime)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });

  const file = res.data.files?.[0];
  if (!file?.id || !file.mimeType) return null;
  return { id: file.id, mimeType: file.mimeType, modifiedTime: file.modifiedTime ?? undefined };
}

/**
 * Download a file from Google Drive by file ID.
 * Returns the file bytes as a Buffer.
 */
async function downloadFile(fileId: string): Promise<Buffer> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(res.data as ArrayBuffer);
}

/**
 * Delete every file in a Drive folder whose name starts with the given
 * prefix (e.g. "ECW526_hardware_zh") regardless of extension.
 * Returns the number of files trashed. Non-fatal: errors are logged
 * but don't throw.
 */
export async function deleteDriveFilesByPrefix(
  folderId: string,
  namePrefix: string,
): Promise<number> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and name contains '${namePrefix.replace(/'/g, "\\'")}'`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 100,
    });
    const files = (res.data.files ?? []).filter((f) =>
      f.name?.toLowerCase().startsWith(namePrefix.toLowerCase()),
    );
    let trashed = 0;
    for (const f of files) {
      if (!f.id) continue;
      try {
        await drive.files.update({
          fileId: f.id,
          requestBody: { trashed: true },
          supportsAllDrives: true,
        });
        trashed++;
      } catch (err) {
        console.error(
          `[deleteDriveFilesByPrefix] trash ${f.name} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    return trashed;
  } catch (err) {
    console.error(
      `[deleteDriveFilesByPrefix] list failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return 0;
  }
}

/**
 * Resolve the DS Images folder for a given product line + locale.
 *
 * Drive layout convention:
 *   Model Datasheet/
 *   ├── Cloud AP/              ← EN product line folder
 *   │   └── DS Images/         ← this is enDsImagesFolderId
 *   ├── Cloud AP_ja/           ← JA product line folder (sibling)
 *   │   └── DS Images/
 *   └── Cloud AP_zh/           ← ZH product line folder (sibling)
 *       └── DS Images/
 *
 * Given the EN DS Images folder ID + the product line name + a locale, this
 * function walks up to the Model Datasheet root, finds the `<name>_<suffix>`
 * sibling, and returns the `DS Images` subfolder inside it.
 *
 * If `DS Images` doesn't exist inside the locale product line folder, it is
 * auto-created. If the locale product line folder itself doesn't exist,
 * throws — creating whole product lines is a PM decision, not automatic.
 *
 * For English (locale === "en" or falsy) this short-circuits and returns
 * enDsImagesFolderId directly.
 */
// In-memory cache for resolved locale DS Images folder IDs. Keyed by
// `${enDsImagesFolderId}:${locale}`. Persists within a single serverless
// invocation (one sync run) and is discarded after. This eliminates
// redundant Drive API lookups when syncing multiple products that share
// the same product line + locale.
const _localeFolderCache = new Map<string, string>();

export async function resolveLocaleDsImagesFolder(params: {
  enDsImagesFolderId: string;
  lineName: string;
  locale: string | null | undefined;
}): Promise<string> {
  const { enDsImagesFolderId, lineName, locale } = params;

  if (!locale || locale === "en") return enDsImagesFolderId;

  const suffix = getLocaleSuffix(locale);
  if (!suffix || suffix === "en") return enDsImagesFolderId;

  // Check cache first — same product line + locale always resolves to
  // the same folder, so within a single sync run we only need to look
  // it up once.
  const cacheKey = `${enDsImagesFolderId}:${locale}`;
  const cached = _localeFolderCache.get(cacheKey);
  if (cached) return cached;

  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  // Walk up: enDsImagesFolderId → enLineFolderId → rootFolderId
  const enDsFolder = await drive.files.get({
    fileId: enDsImagesFolderId,
    fields: "parents",
    supportsAllDrives: true,
  });
  const enLineFolderId = enDsFolder.data.parents?.[0];
  if (!enLineFolderId) {
    throw new Error(
      `EN DS Images folder ${enDsImagesFolderId} has no parent — cannot locate ${lineName}_${suffix}`,
    );
  }

  const enLineFolder = await drive.files.get({
    fileId: enLineFolderId,
    fields: "parents",
    supportsAllDrives: true,
  });
  const rootFolderId = enLineFolder.data.parents?.[0];
  if (!rootFolderId) {
    throw new Error(
      `EN product line folder ${enLineFolderId} has no parent — cannot search for ${lineName}_${suffix}`,
    );
  }

  // Find the locale-specific product line folder (e.g. "Cloud AP_ja")
  const localeLineName = `${lineName}_${suffix}`;
  const lineSearchRes = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${localeLineName.replace(/'/g, "\\'")}' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });

  const localeLineFolderId = lineSearchRes.data.files?.[0]?.id;
  if (!localeLineFolderId) {
    throw new Error(
      `Locale product line folder "${localeLineName}" not found under root. Please create it in Drive first.`,
    );
  }

  // Find DS Images subfolder inside the locale line folder
  const imagesSearchRes = await drive.files.list({
    q: `'${localeLineFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${DS_IMAGES_FOLDER_NAME}' and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });

  const existingDsImagesId = imagesSearchRes.data.files?.[0]?.id;
  if (existingDsImagesId) {
    _localeFolderCache.set(cacheKey, existingDsImagesId);
    return existingDsImagesId;
  }

  // Auto-create DS Images subfolder
  console.log(`[resolveLocaleDsImagesFolder] Creating "${DS_IMAGES_FOLDER_NAME}" inside "${localeLineName}"`);
  const createRes = await drive.files.create({
    requestBody: {
      name: DS_IMAGES_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: [localeLineFolderId],
    },
    supportsAllDrives: true,
    fields: "id",
  });
  const newId = createRes.data.id;
  if (!newId) {
    throw new Error(`Failed to create DS Images folder in ${localeLineName}`);
  }
  _localeFolderCache.set(cacheKey, newId);
  return newId;
}

/**
 * Upload an image file to a Google Drive folder.
 * If a file with the same name exists, it will be updated (overwritten).
 * Returns the Drive file ID.
 */
export async function uploadImageToDrive(
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  // Check if file already exists in the folder
  const existing = await findFileInFolder(folderId, fileName);

  if (existing) {
    // Update existing file
    const res = await drive.files.update({
      fileId: existing.id,
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      supportsAllDrives: true,
    });
    return res.data.id!;
  } else {
    // Create new file
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: "id",
      supportsAllDrives: true,
    });
    return res.data.id!;
  }
}

export interface ImageSyncResult {
  product_image_url: string | null;
  hardware_image_url: string | null;
  /**
   * True when the Drive folder was successfully listed, so the caller can
   * trust `null` fields to mean "the file is not in Drive" (and therefore
   * safe to clear the corresponding DB column). When false (Drive lookup
   * failed for any reason), the caller must NOT treat nulls as deletes.
   */
  folder_listed: boolean;
}

/**
 * List every file in a Drive folder and return a map from lowercase
 * filename → DriveFileInfo. Used by sync to do one listing call instead
 * of per-file lookups.
 */
async function listFilesInFolder(
  folderId: string,
): Promise<Map<string, DriveFileInfo> | null> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  try {
    const out = new Map<string, DriveFileInfo>();
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 1000,
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        if (!f.id || !f.name || !f.mimeType) continue;
        out.set(f.name.toLowerCase(), {
          id: f.id,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime ?? undefined,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  } catch (err) {
    console.error(
      `[listFilesInFolder] ${folderId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Naming rule:
 *   {Model}_product.png   — product photo (cover page)
 *   {Model}_hardware.png  — hardware overview photo
 *   {Model}_radio_{Band}_{Plane}.png — radio pattern (AP only, e.g. ECW526_radio_2.4G_H.png)
 *
 * Images are searched in the product line's DS Images folder first,
 * then fall back to a global Drive search.
 */
/**
 * Options for syncProductImages.
 * Pass existingImages to enable smart sync — only re-download if Drive file is newer.
 */
export interface ImageSyncOptions {
  /** Existing image URLs from DB — used to check Storage timestamps */
  existingImages?: {
    product_image?: string;
    hardware_image?: string;
  };
}

export interface LocalizedImageSyncResult {
  /** Resolved public URL if a file was found, otherwise null */
  url: string | null;
  /**
   * True if the locale DS Images folder was successfully listed. When
   * combined with `url === null`, signals that the file has been deleted
   * from Drive (so the translation row's hardware_image should be cleared).
   * False if the folder couldn't be resolved / listed — caller must NOT
   * interpret nulls as deletes.
   */
  folder_listed: boolean;
}

/**
 * Sync a single locale's hardware image for a product from its locale-
 * specific DS Images folder, writing the result into product_translations.
 *
 * Unlike syncProductImages (which covers the EN canonical image in
 * products.hardware_image), this targets the per-locale translation row and
 * only handles hardware_image (product_image and radio patterns are shared
 * across locales and live in the products table).
 *
 * Return value includes `folder_listed` so the caller can distinguish "file
 * deleted from Drive" (clear product_translations.hardware_image) from
 * "Drive lookup failed" (leave alone).
 */
export async function syncLocalizedHardwareImage(params: {
  modelName: string;
  productId: string;
  locale: string;
  lineName: string;
  enDsImagesFolderId: string;
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;
}): Promise<LocalizedImageSyncResult> {
  const { modelName, productId, locale, lineName, enDsImagesFolderId, supabase } = params;

  const suffix = getLocaleSuffix(locale);
  if (!suffix || suffix === "en") return { url: null, folder_listed: false };

  let localeFolderId: string;
  try {
    localeFolderId = await resolveLocaleDsImagesFolder({
      enDsImagesFolderId,
      lineName,
      locale,
    });
  } catch (err) {
    // Locale product line folder missing → nothing to sync yet (do NOT
    // treat this as a delete signal)
    console.log(
      `[syncLocalizedHardwareImage] Skipping ${modelName} ${locale}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { url: null, folder_listed: false };
  }

  // List folder once so we have authoritative view
  const fileMap = await listFilesInFolder(localeFolderId);
  if (!fileMap) {
    return { url: null, folder_listed: false };
  }

  // Find matching file
  let matched: { file: DriveFileInfo; ext: string; fileName: string } | null = null;
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const fileName = `${modelName}_hardware_${suffix}.${ext}`;
    const file = fileMap.get(fileName.toLowerCase());
    if (file) {
      matched = { file, ext, fileName };
      break;
    }
  }

  if (!matched) {
    // Folder listed successfully but file not present → delete signal.
    // Clear product_translations.hardware_image (only this field).
    const { data: existingTranslation } = await supabase
      .from("product_translations" as "products")
      .select("id, hardware_image")
      .eq("product_id", productId)
      .eq("locale", locale)
      .single() as { data: { id: string; hardware_image: string | null } | null };

    if (existingTranslation?.hardware_image) {
      await supabase
        .from("product_translations" as "products")
        .update({ hardware_image: null })
        .eq("id", existingTranslation.id);
    }
    return { url: null, folder_listed: true };
  }

  const { file, fileName } = matched;
  const buffer = await downloadFile(file.id);
  const storagePath = `images/${modelName}/${fileName}`;

  const { error } = await supabase.storage
    .from("datasheets")
    .upload(storagePath, buffer, {
      contentType: file.mimeType,
      upsert: true,
    });
  if (error) {
    console.error(`[syncLocalizedHardwareImage] Storage upload failed for ${fileName}: ${error.message}`);
    return { url: null, folder_listed: true };
  }

  const { data: urlData } = supabase.storage.from("datasheets").getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  // Upsert into product_translations (hardware_image field only —
  // other fields untouched)
  const { data: existingTranslation } = await supabase
    .from("product_translations" as "products")
    .select("id")
    .eq("product_id", productId)
    .eq("locale", locale)
    .single() as { data: { id: string } | null };

  if (existingTranslation) {
    await supabase
      .from("product_translations" as "products")
      .update({ hardware_image: publicUrl })
      .eq("id", existingTranslation.id);
  } else {
    await supabase
      .from("product_translations" as "products")
      .insert({ product_id: productId, locale, hardware_image: publicUrl });
  }

  return { url: publicUrl, folder_listed: true };
}

export async function syncProductImages(
  modelName: string,
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  dsImagesFolderId?: string | null,
  options?: ImageSyncOptions
): Promise<ImageSyncResult> {
  const result: ImageSyncResult = {
    product_image_url: null,
    hardware_image_url: null,
    folder_listed: false,
  };

  // No folder → nothing to sync, nothing to delete (caller should keep
  // whatever it already has).
  if (!dsImagesFolderId) return result;

  // One list call gives us a complete view of what's in the folder. If
  // this fails we leave folder_listed = false so the caller doesn't
  // misinterpret missing files as deletions.
  const fileMap = await listFilesInFolder(dsImagesFolderId);
  if (!fileMap) return result;
  result.folder_listed = true;

  const imageTypes = [
    { suffix: "product", key: "product_image_url" as const, dbField: "product_image" as const },
    { suffix: "hardware", key: "hardware_image_url" as const, dbField: "hardware_image" as const },
  ];

  for (const { suffix, key, dbField } of imageTypes) {
    // Try .png first, then .jpg
    let matched: { file: DriveFileInfo; ext: string; fileName: string } | null = null;
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const fileName = `${modelName}_${suffix}.${ext}`;
      const file = fileMap.get(fileName.toLowerCase());
      if (file) {
        matched = { file, ext, fileName };
        break;
      }
    }

    if (!matched) {
      // File not in Drive — result[key] stays null. Combined with
      // folder_listed = true, caller treats this as a delete signal
      // when an existing URL was on record.
      continue;
    }

    const { file, ext, fileName } = matched;

    try {
      const storagePath = `images/${modelName}/${modelName}_${suffix}.${ext}`;

      // Smart sync: if we have an existing image, compare Drive modifiedTime
      // with Storage last-modified to skip unnecessary re-downloads
      const existingUrl = options?.existingImages?.[dbField];
      if (existingUrl && file.modifiedTime) {
        try {
          const headRes = await fetch(existingUrl, { method: "HEAD" });
          const storageLastMod = headRes.headers.get("last-modified");
          if (storageLastMod) {
            const driveTime = new Date(file.modifiedTime).getTime();
            const storageTime = new Date(storageLastMod).getTime();
            if (storageTime >= driveTime) {
              // Storage is up-to-date, skip re-download
              result[key] = existingUrl;
              continue;
            }
            // Drive is newer — fall through to re-download
            console.log(`${fileName}: Drive updated (${file.modifiedTime}), re-syncing...`);
          }
        } catch {
          // HEAD request failed — fall through to re-download
        }
      }

      const buffer = await downloadFile(file.id);

      const { error } = await supabase.storage
        .from("datasheets")
        .upload(storagePath, buffer, {
          contentType: file.mimeType,
          upsert: true,
        });

      if (error) {
        console.error(`Failed to upload ${fileName}:`, error.message);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("datasheets")
        .getPublicUrl(storagePath);

      result[key] = urlData.publicUrl;
    } catch (err) {
      console.error(
        `Failed to sync ${fileName}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return result;
}
