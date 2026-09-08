import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import {
  COVER_PHOTO_CATEGORIES,
  MAX_COVER_PHOTOS,
  policyForCategory,
} from "@/lib/datasheet/cover-photo";
import { checkCoverPhoto } from "@/lib/datasheet/cover-photo-check";

/**
 * The line's cover photographs — layouts B (Data Center) and D (Edge AI Box).
 *
 *   POST   multipart: line_id, file      → upload a candidate, make it active
 *   PATCH  json: line_id, url            → make an existing candidate active
 *   DELETE ?line_id=&url=                → remove one candidate
 *   DELETE ?line_id=                     → clear the active one, keep the shortlist
 *
 * Writes product_lines.cover_hero_options (the shortlist) and
 * cover_hero_image (the active one) and nothing else. In particular it does
 * NOT push files to the line's Drive folder, which the per-model uploader
 * does. Two reasons, pointing the same way:
 *
 *   - For the Data Center lines, sync never lists that folder at all
 *     (syncSeriesImages runs only for ds_scope series/both). A file there
 *     would look authoritative and be read by nothing.
 *   - For Orin Box it WOULD be read, into line_datasheets.images.hero —
 *     which these columns deliberately override. Writing both would mean
 *     every upload silently races its own fallback.
 *
 * So Drive stays the PM's own channel, these columns are the uploader's, and
 * the layouts read active-then-Drive. One writer per field.
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

const BUCKET = "datasheets";

/** "Edge Network Appliance" → "Edge_Network_Appliance" */
const slugify = (name: string) => name.replace(/\s+/g, "_");

/**
 * Storage path for a given file's CONTENT, not just its line.
 *
 * The per-model uploader overwrites one fixed path with upsert:true, so the
 * public URL never changes and a replaced image can keep serving from CDN
 * cache. Cover photos are swapped while judging how they look, which is the
 * worst case for that. Hashing the bytes into the name means a new file is a
 * new URL; re-uploading the same file lands on the same object.
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
    .select("id, name, label, category, cover_hero_image, cover_hero_options")
    .eq("id", lineId)
    .single();
  return { supabase, line: error ? null : data };
}

type Supabase = ReturnType<typeof createAdminClient>;

/** Remove a Storage object once nothing references it. Best effort. */
async function dropObject(supabase: Supabase, url: string | null) {
  const path = storagePathFromUrl(url);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn(`line-cover: stale object left behind: ${path}`, error.message);
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
  // Refused rather than ignored: accepting an upload that no layout will ever
  // draw is a support ticket six weeks later.
  if (!COVER_PHOTO_CATEGORIES.has(line.category)) {
    return NextResponse.json(
      { error: `${line.label} 的版型沒有照片封面，這張圖不會被用到。` },
      { status: 422 },
    );
  }

  const options: string[] = line.cover_hero_options ?? [];
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = ALLOWED_IMAGE_TYPES.get(file.type)!;
  const path = storagePathFor(line.name, buffer, ext);
  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // Re-uploading a file already on the shortlist is a request to select it,
  // not a fourth slot. Checked before the cap so it never reads as "full".
  const already = options.includes(publicUrl);
  if (!already && options.length >= MAX_COVER_PHOTOS) {
    return NextResponse.json(
      { error: `最多 ${MAX_COVER_PHOTOS} 張，先移除一張再上傳。` },
      { status: 409 },
    );
  }

  if (!already) {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (uploadError) {
      return NextResponse.json(
        { error: "Upload failed", details: uploadError.message },
        { status: 500 },
      );
    }
  }

  const { error: updateError } = await supabase
    .from("product_lines")
    .update({
      cover_hero_image: publicUrl,
      cover_hero_options: already ? options : [...options, publicUrl],
    })
    .eq("id", line.id);
  if (updateError) {
    return NextResponse.json(
      { error: "Saved the file but not the reference", details: updateError.message },
      { status: 500 },
    );
  }

  // Advisory only, and AFTER the row is written: a photo that measures badly
  // is still the photo the person chose, and refusing it would make a
  // measurement into a veto over a designer.
  let warning: string | null = null;
  const policy = policyForCategory(line.category);
  if (policy) {
    try {
      warning = (await checkCoverPhoto(buffer, policy)).warning;
    } catch (err) {
      // A checker that cannot read the file must not fail the upload.
      console.warn("line-cover: contrast check skipped", err);
    }
  }

  return NextResponse.json({ url: publicUrl, warning });
}

/** Make one of the existing candidates the active cover. */
export async function PATCH(request: Request) {
  const denied = await gate("product.upload_image");
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as
    | { line_id?: string; url?: string }
    | null;
  if (!body?.line_id || !body.url) {
    return NextResponse.json({ error: "Missing line_id or url" }, { status: 400 });
  }

  const { supabase, line } = await loadLine(body.line_id);
  if (!line) {
    return NextResponse.json({ error: "Product line not found" }, { status: 404 });
  }
  // Only ever activate something already on the shortlist — otherwise this is
  // an endpoint that points a printed datasheet at an arbitrary URL.
  if (!(line.cover_hero_options ?? []).includes(body.url)) {
    return NextResponse.json({ error: "That photo is not on this line" }, { status: 422 });
  }

  const { error } = await supabase
    .from("product_lines")
    .update({ cover_hero_image: body.url })
    .eq("id", line.id);
  if (error) {
    return NextResponse.json({ error: "Could not switch", details: error.message }, { status: 500 });
  }
  return NextResponse.json({ url: body.url });
}

export async function DELETE(request: Request) {
  const denied = await gate("product.upload_image");
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const lineId = params.get("line_id");
  const url = params.get("url");
  if (!lineId) {
    return NextResponse.json({ error: "Missing line_id" }, { status: 400 });
  }

  const { supabase, line } = await loadLine(lineId);
  if (!line) {
    return NextResponse.json({ error: "Product line not found" }, { status: 404 });
  }
  const options: string[] = line.cover_hero_options ?? [];

  // No url = "stop using a photo", keeping the shortlist. With a url = drop
  // that candidate for good.
  const remaining = url ? options.filter((o) => o !== url) : options;
  const active =
    url && line.cover_hero_image === url
      ? // Promote whatever is left rather than leaving the cover blank when
        // the line still has candidates.
        (remaining[0] ?? null)
      : url
        ? line.cover_hero_image
        : null;

  const { error } = await supabase
    .from("product_lines")
    .update({ cover_hero_image: active, cover_hero_options: remaining })
    .eq("id", line.id);
  if (error) {
    return NextResponse.json(
      { error: "Could not update the cover", details: error.message },
      { status: 500 },
    );
  }

  // Only once the row no longer references it.
  if (url && !remaining.includes(url)) await dropObject(supabase, url);

  return NextResponse.json({ ok: true, active });
}
