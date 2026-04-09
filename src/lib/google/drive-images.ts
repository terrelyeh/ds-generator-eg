import { google } from "googleapis";
import { Readable } from "stream";
import { getGoogleAuth } from "./auth";

/**
 * Find a file by exact name within a specific Google Drive folder.
 * Returns the Drive file ID and mimeType, or null if not found.
 */
async function findFileInFolder(
  folderId: string,
  fileName: string
): Promise<{ id: string; mimeType: string } | null> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and name = '${fileName}' and mimeType contains 'image/' and trashed = false`,
    fields: "files(id, name, mimeType)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });

  const file = res.data.files?.[0];
  if (!file?.id || !file.mimeType) return null;
  return { id: file.id, mimeType: file.mimeType };
}

/**
 * Find a file by exact name across all accessible Google Drive files (fallback).
 */
async function findFileByName(
  fileName: string
): Promise<{ id: string; mimeType: string } | null> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.list({
    q: `name = '${fileName}' and mimeType contains 'image/' and trashed = false`,
    fields: "files(id, name, mimeType)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });

  const file = res.data.files?.[0];
  if (!file?.id || !file.mimeType) return null;
  return { id: file.id, mimeType: file.mimeType };
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
export async function syncProductImages(
  modelName: string,
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  dsImagesFolderId?: string | null
): Promise<ImageSyncResult> {
  const result: ImageSyncResult = {
    product_image_url: null,
    hardware_image_url: null,
  };

  const imageTypes = [
    { suffix: "product", key: "product_image_url" as const },
    { suffix: "hardware", key: "hardware_image_url" as const },
  ];

  for (const { suffix, key } of imageTypes) {
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

        const buffer = await downloadFile(file.id);
        const storagePath = `images/${modelName}/${modelName}_${suffix}.${ext}`;

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
