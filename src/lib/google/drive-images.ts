import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

/**
 * Find a file in Google Drive by exact name.
 * Returns the Drive file ID or null if not found.
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

export interface ImageSyncResult {
  product_image_url: string | null;
  hardware_image_url: string | null;
}

/**
 * Find, download, and upload product images from Google Drive to Supabase Storage.
 * Returns the public URLs of the uploaded images.
 */
export async function syncProductImages(
  modelName: string,
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>
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
    const fileName = `${modelName}_${suffix}.png`;

    try {
      const file = await findFileByName(fileName);
      if (!file) continue;

      const buffer = await downloadFile(file.id);
      const storagePath = `images/${modelName}/${fileName}`;

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
    } catch (err) {
      console.error(
        `Failed to sync ${fileName}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return result;
}
