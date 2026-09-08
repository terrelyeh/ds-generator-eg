import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";

/**
 * The line's cover photograph — layouts B (Data Center) and D (Edge AI Box).
 *
 *   POST   /api/line-cover   multipart: line_id, file   → set it
 *   DELETE /api/line-cover?line_id=…                    → clear it
 *
 * Writes product_lines.cover_hero_image and nothing else. In particular it
 * does NOT push the file to the line's Drive folder, which the per-model
 * uploader does. Two reasons, and they point the same way:
 *
 *   - For the Data Center lines, sync never lists that folder at all
 *     (syncSeriesImages runs only for ds_scope series/both). A file there
 *     would look authoritative and be read by nothing.
 *   - For Orin Box it WOULD be read, into line_datasheets.images.hero —
 *     which this column deliberately overrides. Writing both would mean
 *     every upload silently races its own fallback.
 *
 * So: Drive stays the PM's own channel, this column is the uploader's, and
 * the layouts read this first and Drive second. One writer per field.
 */

/**
 * Same list as the per-model uploader. SVG is absent on purpose — these are
 * served from a public bucket, and an SVG is a document that can carry
 * script.
 */
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Only these layouts draw a cover photograph. */
const COVER_PHOTO_CATEGORIES = new Set([
  "Edge Network Appliances",
  "AI Servers",
  "Edge AI Computers",
]);

const BUCKET = "datasheets";

/** "Edge Network Appliance" → "Edge_Network_Appliance" */
const slugify = (name: string) => name.replace(/\s+/g, "_");

/**
 * Storage path for a given file's CONTENT, not just its line.
 *
 * The per-model uploader overwrites one fixed path with upsert:true, so the
 * public URL never changes and a replaced image can keep serving from CDN
 * cache. A cover photo is a thing people swap while judging how it looks,
 * which is the worst case for that. Hashing the bytes into the name means a
 * new file is a new URL; re-uploading the same file is a no-op.
 */
function storagePathFor(lineName: string, buffer: Buffer, ext: string) {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  return `images/_line-hero/${slugify(lineName)}/hero-${hash}.${ext}`;
}

/** The object a stored URL points at, or null if it is not one of ours. */
function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length));
}

async function loadLine(lineId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("product_lines")
    .select("id, name, label, category, cover_hero_image")
    .eq("id", lineId)
    .single();
  return { supabase, line: error ? null : data };
}

export async function POST(request: Request) {
  const denied = await gate("product.upload_image");
  if (denied) return denied;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const lineId = formData.get("line_id") as string | null;

  if (!file || !lineId) {
    return NextResponse.json({ error: "Missing file or line_id" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "只收 PNG / JPEG / WebP 圖片。" }, { status: 415 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `圖片太大（${Math.round(file.size / 1024 / 1024)} MB），上限 20 MB。` },
      { status: 413 },
    );
  }

  const { supabase, line } = await loadLine(lineId);
  if (!line) {
    return NextResponse.json({ error: "Product line not found" }, { status: 404 });
  }
  // Refused rather than ignored: accepting an upload that no layout will
  // ever draw is a support ticket six weeks later.
  if (!COVER_PHOTO_CATEGORIES.has(line.category)) {
    return NextResponse.json(
      { error: `${line.label} 的版型沒有照片封面，這張圖不會被用到。` },
      { status: 422 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = ALLOWED_IMAGE_TYPES.get(file.type)!;
  const path = storagePathFor(line.name, buffer, ext);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json(
      { error: "Upload failed", details: uploadError.message },
      { status: 500 },
    );
  }

  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { error: updateError } = await supabase
    .from("product_lines")
    .update({ cover_hero_image: publicUrl })
    .eq("id", line.id);
  if (updateError) {
    return NextResponse.json(
      { error: "Saved the file but not the reference", details: updateError.message },
      { status: 500 },
    );
  }

  // Only once the row points at the new object. Best effort: an orphan in
  // the bucket costs storage, a missing object costs a broken cover.
  const previous = storagePathFromUrl(line.cover_hero_image);
  if (previous && previous !== path) {
    const { error } = await supabase.storage.from(BUCKET).remove([previous]);
    if (error) console.warn(`line-cover: stale object left behind: ${previous}`, error.message);
  }

  return NextResponse.json({ url: publicUrl });
}

export async function DELETE(request: Request) {
  const denied = await gate("product.upload_image");
  if (denied) return denied;

  const lineId = new URL(request.url).searchParams.get("line_id");
  if (!lineId) {
    return NextResponse.json({ error: "Missing line_id" }, { status: 400 });
  }

  const { supabase, line } = await loadLine(lineId);
  if (!line) {
    return NextResponse.json({ error: "Product line not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("product_lines")
    .update({ cover_hero_image: null })
    .eq("id", line.id);
  if (updateError) {
    return NextResponse.json(
      { error: "Could not clear the cover", details: updateError.message },
      { status: 500 },
    );
  }

  const path = storagePathFromUrl(line.cover_hero_image);
  if (path) {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) console.warn(`line-cover: stale object left behind: ${path}`, error.message);
  }

  return NextResponse.json({ ok: true });
}
