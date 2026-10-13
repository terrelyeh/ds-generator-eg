import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleAuth } from "@eg/google/auth";
import { logIfDbError } from "@eg/db/errors";
import { pickPrunable } from "@/lib/datasheet/prune-pdfs";

/**
 * After a Generate, drop this model's superseded PDFs (same language) from
 * Supabase Storage. The rules — and why Drive has to vouch for each file —
 * are in `lib/datasheet/prune-pdfs.ts`.
 *
 * Best effort: every failure is logged and leaves everything in place. The
 * PDF has already been made; a cleanup problem must never turn that into an
 * error. And when it can't tell what's marked or what Drive holds, it keeps
 * the files rather than guessing (pitfall #73).
 */
export async function pruneSupersededPdfs(
  supabase: SupabaseClient,
  params: {
    productId: string;
    model: string;
    /** `en`, `ja`, `zh-TW`, `es` — as stored in website_marks. */
    locale: string;
    /** File-name suffix for that locale (`ja`, `zh`, `es`); null = English. */
    suffix: string | null;
    currentName: string;
    /** The Drive folder this Generate uploaded into. */
    driveFolderId: string;
  },
): Promise<string[]> {
  const { productId, model, locale, suffix, currentName, driveFolderId } = params;
  const label = `[prune-pdfs] ${model} (${locale})`;
  try {
    const listed = await supabase.storage.from("datasheets").list(model, { limit: 1000 });
    if (listed.error) {
      console.warn(`${label}: Storage list failed, keeping everything: ${listed.error.message}`);
      return [];
    }

    const marks = await supabase
      .from("website_marks")
      .select("version")
      .eq("product_id", productId)
      .eq("locale", locale);
    if (marks.error) {
      console.warn(`${label}: website_marks read failed, keeping everything: ${marks.error.message}`);
      return [];
    }

    const drive = google.drive({ version: "v3", auth: getGoogleAuth() });
    const inDrive = await drive.files.list({
      q: `'${driveFolderId}' in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: "files(name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 1000,
    });

    const prunable = pickPrunable({
      storageNames: (listed.data ?? []).map((o) => o.name),
      currentName,
      suffix,
      markedVersions: (marks.data ?? []).map((m) => (m as { version: string }).version),
      driveNames: (inDrive.data.files ?? []).map((f) => f.name ?? ""),
    });
    if (prunable.length === 0) return [];

    const paths = prunable.map((name) => `${model}/${name}`);
    const removed = await supabase.storage.from("datasheets").remove(paths);
    if (removed.error) {
      console.warn(`${label}: Storage remove failed: ${removed.error.message}`);
      return [];
    }

    // Version history offers a Download link per row; these now point at
    // nothing. The PDFs themselves are in Drive.
    const urls = paths.map((p) => supabase.storage.from("datasheets").getPublicUrl(p).data.publicUrl);
    logIfDbError(
      `${label} versions clear pdf_storage_path`,
      await supabase
        .from("versions")
        .update({ pdf_storage_path: null })
        .eq("product_id", productId)
        .in("pdf_storage_path", urls),
    );

    console.info(`${label}: pruned ${prunable.length} superseded PDF(s) from Storage.`);
    return prunable;
  } catch (err) {
    console.warn(`${label}: skipped — ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
