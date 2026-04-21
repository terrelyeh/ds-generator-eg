/**
 * PATCH /api/products/[model]/layout-ack
 *
 * Sets or clears a per-locale layout-overflow acknowledgement on a
 * product. After visually verifying the generated PDF is acceptable
 * (perhaps after adjusting typography settings), a PM can mark a
 * locale as "reviewed OK" here — the Dashboard will stop showing red
 * for that locale until the ack is cleared.
 *
 * Request body: { locale: "en" | "ja" | "zh-TW", ack: boolean }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ model: string }> },
) {
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

  // Read current ack map, merge, write back
  const { data: row, error: readErr } = await supabase
    .from("products")
    .select("id, layout_ack")
    .eq("model_name", model)
    .single();

  if (readErr || !row) {
    return NextResponse.json(
      { error: `product "${model}" not found` },
      { status: 404 },
    );
  }

  const next = {
    ...(row.layout_ack as Record<string, boolean> | null ?? {}),
    [body.locale]: body.ack,
  };

  const { error: writeErr } = await supabase
    .from("products")
    .update({ layout_ack: next })
    .eq("id", row.id);

  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, layout_ack: next });
}
