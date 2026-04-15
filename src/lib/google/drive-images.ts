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
 * Find a file by exact name across all accessible Google Drive files (fallback).
 */
async function findFileByName(
  fileName: string
): Promise<DriveFileInfo | null> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.list({
    q: `name = '${fileName}' and mimeType contains 'image/' and trashed = false`,
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
export async function resolveLocaleDsImagesFolder(params: {
  enDsImagesFolderId: string;
  lineName: string;
  locale: string | null | undefined;
}): Promise<string> {
  const { enDsImagesFolderId, lineName, locale } = params;

  if (!locale || locale === "en") return enDsImagesFolderId;

  const suffix = getLocaleSuffix(locale);
  if (!suffix || suffix === "en") return enDsImagesFolderId;

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
  if (existingDsImagesId) return existingDsImagesId;

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

/**
 * Sync a single locale's hardware image for a product from its locale-
 * specific DS Images folder, writing the result into product_translations.
 *
 * Unlike syncProductImages (which covers the EN canonical image in
 * products.hardware_image), this targets the per-locale translation row and
 * only handles hardware_image (product_image and radio patterns are shared
 * across locales and live in the products table).
 *
 * Returns the resolved public URL if a file was found and synced, or null.
 */
export async function syncLocalizedHardwareImage(params: {
  modelName: string;
  productId: string;
  locale: string;
  lineName: string;
  enDsImagesFolderId: string;
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;
}): Promise<string | null> {
  const { modelName, productId, locale, lineName, enDsImagesFolderId, supabase } = params;

  const suffix = getLocaleSuffix(locale);
  if (!suffix || suffix === "en") return null;

  let localeFolderId: string;
  try {
    localeFolderId = await resolveLocaleDsImagesFolder({
      enDsImagesFolderId,
      lineName,
      locale,
    });
  } catch (err) {
    // Locale product line folder missing → nothing to sync yet
    console.log(
      `[syncLocalizedHardwareImage] Skipping ${modelName} ${locale}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  for (const ext of ["png", "jpg"]) {
    const fileName = `${modelName}_hardware_${suffix}.${ext}`;
    const file = await findFileInFolder(localeFolderId, fileName);
    if (!file) continue;

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
      return null;
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

    return publicUrl;
  }

  return null;
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
  };

  const imageTypes = [
    { suffix: "product", key: "product_image_url" as const, dbField: "product_image" as const },
    { suffix: "hardware", key: "hardware_image_url" as const, dbField: "hardware_image" as const },
  ];

  for (const { suffix, key, dbField } of imageTypes) {
    // Try .png first, then .jpg
    for (const ext of ["png", "jpg"]) {
      const fileName = `${modelName}_${suffix}.${ext}`;

      try {
        // Search in DS Images folder first, then fallback to global search
        const file = dsImagesFolderId
          ? (await findFileInFolder(dsImagesFolderId, fileName)) ??
            (await findFileByName(fileName))
          : await findFileByName(fileName);

        if (!file) continue;

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
                break;
              }
              // Drive is newer — fall through to re-download
              console.log(`${fileName}: Drive updated (${file.modifiedTime}), re-syncing...`);
            }
          } catch {
            // HEAD request failed — fall through to re-download
          }
        }

        const buffer = await downloadFile(file.id);

        // Upload to Supabase Storage (upsert to overwrite if exists)
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

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("datasheets")
          .getPublicUrl(storagePath);

        result[key] = urlData.publicUrl;
        break; // Found this image type, skip other extensions
      } catch (err) {
        console.error(
          `Failed to sync ${fileName}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  return result;
}
