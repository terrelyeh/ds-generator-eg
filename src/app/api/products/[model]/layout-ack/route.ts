/**
 * PATCH /api/products/[model]/layout-ack
 *
 * Sets or clears a per-locale layout-overflow acknowledgement on a
 * product. After visually verifying the generated PDF is acceptable
 * (perhaps after adjusting typography settings), a PM can mark a
 * locale as "reviewed OK" here — the Dashboard will stop showing red
 * for that locale until the ack is cleared OR the content changes.
 *
 * Content-binding: when ack=true, we hash the current overview+features
 * for that locale and store `{acked: true, hash}`. Any later content
 * change makes the hash stale and the ack silently invalidates.
 *
 * Request body: { locale: "en" | "ja" | "zh-TW", ack: boolean }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate } from "@/lib/auth/session";
import {
  computeContentHash,
  type LayoutAckValue,
} from "@/lib/datasheet/layout-ack";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ model: string }> },
) {
  const denied = await gate("product.edit");
  if (denied) return denied;
  const { model } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { locale?: string; ack?: boolean }
    | null;

  if (!body?.locale || typeof body.ack !== "boolean") {
    return NextResponse.json(
      { error: "body must be { locale: string, ack: boolean }" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Read current ack map + content so we can hash at ack time
  const { data: row, error: readErr } = await supabase
    .from("products")
    .select("id, overview, features, layout_ack")
    .eq("model_name", model)
    .single() as {
      data: {
        id: string;
        overview: string;
        features: string[];
        layout_ack: Record<string, LayoutAckValue | undefined> | null;
      } | null;
      error: { message: string } | null;
    };

  if (readErr || !row) {
    return NextResponse.json(
      { error: `product "${model}" not found` },
      { status: 404 },
    );
  }

  // For non-English locales, hash the locale's translated content (fall
  // back to English if a field is missing — same logic the layout check
  // uses at render time). For English, hash the product's own content.
  let overview: string | null = row.overview;
  let features: string[] | null = row.features;

  if (body.locale !== "en") {
    const { data: t } = await supabase
      .from("product_translations" as "products")
      .select("overview, features")
      .eq("product_id", model)
      .eq("locale", body.locale)
      .maybeSingle() as {
        data: { overview: string | null; features: string[] | null } | null;
      };
    if (t) {
      overview = t.overview ?? row.overview;
      features = (t.features ?? row.features) as string[];
    }
  }

  const next: Record<string, LayoutAckValue | undefined> = {
    ...(row.layout_ack ?? {}),
  };

  if (body.ack) {
    next[body.locale] = {
      acked: true,
      hash: computeContentHash(overview, features),
    };
  } else {
    // Remove the key entirely rather than storing `false` — simpler.
    delete next[body.locale];
  }

  const { error: writeErr } = await supabase
    .from("products")
    .update({ layout_ack: next })
    .eq("id", row.id);

  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, layout_ack: next });
}
