import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { isAllowedAssetPath, KNOWLEDGE_ASSETS_BUCKET, safeDecode } from "@/lib/rag/doc-view";

/**
 * GET /api/knowledge-assets/<storage path>
 *
 * Images that belong to indexed knowledge (e.g. the diagrams in an internal
 * doc package) live in the private `knowledge-assets` bucket. Answers and the
 * /knowledge/doc viewer point <img> at this route; it checks the session and
 * redirects to a short-lived signed URL.
 *
 * Gated on ask.use, not knowledge.view: anyone who can be shown an answer
 * citing this content can be shown the figure it cites, and viewers have
 * ask.use without knowledge.view.
 *
 * Redirecting rather than streaming the bytes keeps the image on Supabase's
 * origin — an SVG opened directly as a page then cannot script against an
 * EnGenie session.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const denied = await gate("ask.use");
  if (denied) return denied;

  const { path } = await params;
  const storagePath = path.map(safeDecode).join("/");
  if (!isAllowedAssetPath(storagePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(KNOWLEDGE_ASSETS_BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const res = NextResponse.redirect(data.signedUrl, 302);
  // The signed URL lives an hour; let the browser reuse this redirect for a
  // few minutes so re-rendering a conversation doesn't mint one per image.
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}
