import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

/**
 * Fetch a Google Doc's content as markdown via Drive API (service account auth).
 *
 * Works for private docs as long as the doc is shared with the service account
 * email (found in GOOGLE_SERVICE_ACCOUNT_JSON). Falls back to plain text if
 * markdown export is unavailable.
 *
 * Returns:
 *   - content: the doc body as markdown (or plain text fallback)
 *   - title: the doc's filename
 */
/**
 * Try fetching via Drive API with service account auth.
 * Requires the doc to be shared with the service account email.
 */
async function fetchViaServiceAccount(docId: string): Promise<{
  content: string;
  title: string;
}> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const meta = await drive.files.get({
    fileId: docId,
    fields: "id, name, mimeType",
    supportsAllDrives: true,
  });

  const title = meta.data.name || "Untitled";

  if (meta.data.mimeType !== "application/vnd.google-apps.document") {
    throw new Error(`Not a Google Doc (mimeType: ${meta.data.mimeType})`);
  }

  let content: string;
  try {
    const res = await drive.files.export(
      { fileId: docId, mimeType: "text/markdown" },
      { responseType: "text" }
    );
    content = typeof res.data === "string" ? res.data : String(res.data);
  } catch {
    const res = await drive.files.export(
      { fileId: docId, mimeType: "text/plain" },
      { responseType: "text" }
    );
    content = typeof res.data === "string" ? res.data : String(res.data);
  }

  if (!content || content.trim().length < 50) {
    throw new Error("Empty content from Drive API");
  }

  return { content, title };
}

/**
 * Fallback: fetch via public export URL (works if doc is "Anyone with link").
 * Used when the service account doesn't have explicit access to the doc,
 * e.g. Google Workspace docs where external sharing is limited.
 */
async function fetchViaPublicExport(docId: string): Promise<{
  content: string;
  title: string;
}> {
  // Try markdown first — Google Docs now supports md export
  let res = await fetch(
    `https://docs.google.com/document/d/${docId}/export?format=md`,
    { redirect: "follow" }
  );
  let format: "md" | "txt" = "md";
  if (!res.ok) {
    res = await fetch(
      `https://docs.google.com/document/d/${docId}/export?format=txt`,
      { redirect: "follow" }
    );
    format = "txt";
  }
  if (!res.ok) {
    throw new Error(
      `Public export failed: ${res.status}. Doc must be shared as "Anyone with the link".`
    );
  }

  const content = await res.text();
  if (!content || content.trim().length < 50) {
    throw new Error("Empty content from public export");
  }

  // Extract title from first non-empty line
  const firstLine = content.split("\n").find((l) => l.trim()) || "Untitled";
  const title = firstLine
    .replace(/^#+\s*/, "")
    .replace(/^\\?\[.*?\\?\]\s*/, "")
    .trim() || "Untitled";

  return { content: format === "md" ? content : content, title };
}

/**
 * Fetch a Google Doc's content as markdown.
 *
 * Strategy:
 *   1. Try Drive API with service account (works for docs shared with SA)
 *   2. Fall back to public export URL (works for "Anyone with link" docs)
 */
export async function fetchGoogleDoc(docId: string): Promise<{
  content: string;
  title: string;
}> {
  const errors: string[] = [];

  try {
    return await fetchViaServiceAccount(docId);
  } catch (err) {
    errors.push(`Service account: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    return await fetchViaPublicExport(docId);
  } catch (err) {
    errors.push(`Public export: ${err instanceof Error ? err.message : String(err)}`);
  }

  throw new Error(
    `Failed to fetch Google Doc ${docId}. Tried:\n- ${errors.join("\n- ")}`
  );
}
