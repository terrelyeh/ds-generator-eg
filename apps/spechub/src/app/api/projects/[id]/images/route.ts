import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { LABEL_SIDES } from "@/lib/project-datasheet/types";
import type { ImageLabel, LabelSide, ModelImage } from "@/lib/project-datasheet/types";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

/** Product renders, not source documents. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

/**
 * POST /api/projects/[id]/images — multipart { file, slot, modelId? }
 * PATCH /api/projects/[id]/images — json { url, modelId?, caption?, labels? }
 * DELETE /api/projects/[id]/images — json { url, modelId? }
 *
 * Uploads land in the PUBLIC `project-images` bucket and the returned URL is
 * appended to the target's `images`. `modelId` absent means the document
 * itself (the deployment diagram).
 *
 * Kept separate from the source-document upload in /extract, which writes to
 * the private bucket. Same gesture in the UI, opposite sensitivity: one is
 * evidence we keep, the other is artwork we print and hand over.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const form = await request.formData();
  const file = form.get("file");
  const slot = String(form.get("slot") ?? "").trim() || "product";
  const modelId = String(form.get("modelId") ?? "").trim() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "只收 PNG / JPEG / WebP / SVG 圖片。原廠規格書請用型號底下的「從來源讀取規格」。" },
      { status: 415 },
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "圖片超過 12 MB。" }, { status: 413 });
  }

  const supabase = createAdminClient();
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const path = `${id}/${crypto.randomUUID()}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("project-images")
    .upload(path, await file.arrayBuffer(), { contentType: file.type });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("project-images").getPublicUrl(path);
  const url = urlData.publicUrl;

  const current = await loadImages(supabase, id, modelId);
  if (current === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Only one cover shot per model — a second would print over the first, and
  // silently. Replacing is what the user meant by uploading another one.
  const next =
    slot === "product"
      ? [{ slot, url }, ...current.filter((i) => i.slot !== "product")]
      : [...current, { slot, url }];

  const saved = await saveImages(supabase, id, modelId, next);
  if (saved) return NextResponse.json({ error: saved }, { status: 500 });

  return NextResponse.json({ url, slot, images: next });
}

/**
 * Caption and on-image labels. Separate from POST because the file is already
 * uploaded and re-sending a 12 MB render to fix a typo is absurd; separate
 * from the document's own save because the uploader writes immediately and a
 * form save must not clobber what it never loaded.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    modelId?: string | null;
    caption?: string | null;
    labels?: unknown;
  };
  if (!body.url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const supabase = createAdminClient();
  const modelId = body.modelId ?? null;
  const current = await loadImages(supabase, id, modelId);
  if (current === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!current.some((i) => i.url === body.url)) {
    return NextResponse.json({ error: "image not found" }, { status: 404 });
  }

  const next = current.map((i) =>
    i.url === body.url
      ? {
          ...i,
          // Absent means "leave alone"; an empty string means "clear it".
          caption:
            body.caption === undefined ? (i.caption ?? null) : (body.caption?.trim() || null),
          labels: body.labels === undefined ? (i.labels ?? []) : asLabels(body.labels),
        }
      : i,
  );

  const saved = await saveImages(supabase, id, modelId, next);
  if (saved) return NextResponse.json({ error: saved }, { status: 500 });

  return NextResponse.json({ images: next });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    modelId?: string | null;
  };
  if (!body.url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const supabase = createAdminClient();
  const modelId = body.modelId ?? null;
  const current = await loadImages(supabase, id, modelId);
  if (current === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  const next = current.filter((i) => i.url !== body.url);
  const saved = await saveImages(supabase, id, modelId, next);
  if (saved) return NextResponse.json({ error: saved }, { status: 500 });

  // The stored object is left alone. A URL can be reused by a duplicate of
  // this document, and deleting the file would blank the image on a datasheet
  // nobody was editing. Orphaned objects are cheap; a broken PDF is not.
  return NextResponse.json({ images: next });
}

async function loadImages(
  supabase: ReturnType<typeof createAdminClient>,
  docId: string,
  modelId: string | null,
): Promise<ModelImage[] | null> {
  if (modelId) {
    const { data } = await supabase
      .from("project_datasheet_models")
      .select("images")
      .eq("id", modelId)
      .eq("project_datasheet_id", docId)
      .maybeSingle();
    return data ? asImages((data as Pick<ProjectDatasheetModel, "images">).images) : null;
  }
  const { data } = await supabase
    .from("project_datasheets")
    .select("images")
    .eq("id", docId)
    .maybeSingle();
  return data ? asImages((data as Pick<ProjectDatasheet, "images">).images) : null;
}

async function saveImages(
  supabase: ReturnType<typeof createAdminClient>,
  docId: string,
  modelId: string | null,
  images: ModelImage[],
): Promise<string | null> {
  const patch = { images: images as never, updated_at: new Date().toISOString() };
  const { error } = modelId
    ? await supabase
        .from("project_datasheet_models")
        .update(patch)
        .eq("id", modelId)
        .eq("project_datasheet_id", docId)
    : await supabase.from("project_datasheets").update(patch).eq("id", docId);
  return error?.message ?? null;
}

function asImages(value: unknown): ModelImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((i) =>
    i && typeof i === "object" && typeof (i as ModelImage).url === "string"
      ? [
          {
            slot: (i as ModelImage).slot || "product",
            url: (i as ModelImage).url,
            caption: (i as ModelImage).caption ?? null,
            labels: asLabels((i as ModelImage).labels),
          },
        ]
      : [],
  );
}

/**
 * Coordinates are clamped rather than rejected. They arrive from a click on a
 * preview, and a click one pixel outside the image is a slip, not an attack —
 * dropping the label would lose the text the author just typed. Out-of-range
 * values do have to be stopped though: a label at 400% prints outside the
 * page box, where it is invisible on screen and still there in the PDF.
 */
function asLabels(value: unknown): ImageLabel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((l) => {
    if (!l || typeof l !== "object") return [];
    const { x, y, text, side } = l as ImageLabel;
    const t = typeof text === "string" ? text.trim().slice(0, 60) : "";
    if (!t || !Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [
      {
        x: clamp(x),
        y: clamp(y),
        text: t,
        side: LABEL_SIDES.includes(side as LabelSide) ? (side as LabelSide) : "right",
      },
    ];
  });
}

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));
