import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate } from "@/lib/auth/session";

const BUCKET = "knowledge-files";

/**
 * GET /api/documents/file-url?source_id=<id>
 * Returns a short-lived signed URL to view/download an uploaded file's original
 * (stored in the private knowledge-files bucket). Admin/knowledge-view gated.
 */
export async function GET(request: Request) {
  const denied = await gate("knowledge.view");
  if (denied) return denied;

  const sourceId = new URL(request.url).searchParams.get("source_id");
  if (!sourceId) return NextResponse.json({ error: "Missing source_id" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: row } = (await supabase
    .from("documents" as "products")
    .select("metadata")
    .eq("source_type", "file")
    .eq("source_id", sourceId)
    .eq("chunk_index", 0)
    .maybeSingle()) as { data: { metadata: Record<string, unknown> | null } | null };

  const path = row?.metadata?.storage_path as string | undefined;
  if (!path) return NextResponse.json({ error: "Original file not available" }, { status: 404 });

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not create download link" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, url: data.signedUrl });
}
