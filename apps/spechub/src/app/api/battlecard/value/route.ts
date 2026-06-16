import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate, getCurrentUser } from "@eg/auth/session";

/**
 * POST /api/battlecard/value
 * Upsert one battlecard cell (an EnGenius anchor value or a competitor value).
 *
 * Body: {
 *   valueId?: string | null,        // existing row → update; null/omitted → insert
 *   dimensionId: string,
 *   ownerType: "engenius" | "competitor",
 *   ownerKey: string,               // anchor model_name OR competitor_product_id
 *   value: string,
 *   sourceUrl?: string | null,
 *   confirm?: boolean,              // true = Save & Confirm (mark confirmed)
 *                                   // false/omitted = Save draft (never un-confirms)
 * }
 *
 * Mirrors the translation Draft/Confirmed contract: `confirmed` is only ever
 * set to true (on confirm) — a plain Save never flips it back to false.
 */
export async function POST(request: Request) {
  const denied = await gate("battlecard.edit");
  if (denied) return denied;

  const user = await getCurrentUser();
  const body = await request.json();
  const { valueId, dimensionId, ownerType, ownerKey, value, sourceUrl, confirm } =
    body as {
      valueId?: string | null;
      dimensionId?: string;
      ownerType?: "engenius" | "competitor";
      ownerKey?: string;
      value?: string;
      sourceUrl?: string | null;
      confirm?: boolean;
    };

  if (!dimensionId || !ownerType || !ownerKey) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Build the confirm fields once — only ever sets confirmed true.
  const confirmFields = confirm
    ? { confirmed: true, confirmed_by: user?.id ?? null, confirmed_at: now }
    : {};

  if (valueId) {
    // Update an existing cell. Leave extraction_method/captured_at intact so
    // the original provenance (ai_firecrawl + scrape date) is preserved.
    const update: Record<string, unknown> = {
      value: value ?? "",
      updated_at: now,
      ...confirmFields,
    };
    if (sourceUrl !== undefined) update.source_url = sourceUrl?.trim() || null;

    const { error } = await supabase
      .from("battlecard_values")
      .update(update)
      .eq("id", valueId);

    if (error) {
      return NextResponse.json({ error: "Save failed", details: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: valueId, confirmed: !!confirm });
  }

  // Insert a new cell. A hand-entered value is 'manual' provenance.
  const insert: Record<string, unknown> = {
    dimension_id: dimensionId,
    value: value ?? "",
    source_url: sourceUrl?.trim() || null,
    extraction_method: "manual",
    captured_at: now,
    updated_at: now,
    anchor_model_name: ownerType === "engenius" ? ownerKey : null,
    competitor_product_id: ownerType === "competitor" ? ownerKey : null,
    ...confirmFields,
  };

  const { data, error } = await supabase
    .from("battlecard_values")
    .insert(insert)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Save failed", details: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data?.id ?? null, confirmed: !!confirm });
}
