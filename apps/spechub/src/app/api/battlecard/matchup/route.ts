import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";

/**
 * Manage competitor matchups for a battlecard (PM-facing CRUD).
 *
 * A "matchup" = one competitor model lined up against one EnGenius anchor model
 * at a relational tier. Creating one will create/reuse the competitor brand and
 * the competitor product as needed (idempotent on their natural keys).
 *
 *   POST   { lineId, anchorModelName, brandName, competitorModelName,
 *            displayName?, tier, datasheetUrl? }   → create/upsert matchup
 *   PATCH  { anchorModelName, competitorProductId, tier }  → change tier
 *   DELETE { anchorModelName, competitorProductId }        → remove matchup
 */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  const denied = await gate("battlecard.edit");
  if (denied) return denied;

  const body = await request.json();
  const {
    lineId,
    anchorModelName,
    brandName,
    competitorModelName,
    displayName,
    tier,
    datasheetUrl,
  } = body as {
    lineId?: string;
    anchorModelName?: string;
    brandName?: string;
    competitorModelName?: string;
    displayName?: string;
    tier?: number;
    datasheetUrl?: string;
  };

  if (!lineId || !anchorModelName || !brandName || !competitorModelName || !tier) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (![1, 2, 3].includes(tier)) {
    return NextResponse.json({ error: "tier must be 1, 2 or 3" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const slug = slugify(brandName);

  // 1. Brand (reuse by slug).
  const { data: comp, error: compErr } = await supabase
    .from("competitors")
    .upsert({ slug, name: brandName.trim() }, { onConflict: "slug" })
    .select("id")
    .single();
  if (compErr || !comp) {
    return NextResponse.json({ error: "Brand save failed", details: compErr?.message }, { status: 500 });
  }

  // 2. Competitor product (reuse by competitor + model).
  const { data: cp, error: cpErr } = await supabase
    .from("competitor_products")
    .upsert(
      {
        competitor_id: comp.id,
        model_name: competitorModelName.trim(),
        display_name: displayName?.trim() || null,
        product_line_id: lineId,
        datasheet_url: datasheetUrl?.trim() || null,
        source_url: datasheetUrl?.trim() || null,
      },
      { onConflict: "competitor_id,model_name" }
    )
    .select("id")
    .single();
  if (cpErr || !cp) {
    return NextResponse.json({ error: "Model save failed", details: cpErr?.message }, { status: 500 });
  }

  // 3. Matchup (relational tier).
  const { error: mErr } = await supabase
    .from("competitor_matchups")
    .upsert(
      {
        product_line_id: lineId,
        anchor_model_name: anchorModelName,
        competitor_product_id: cp.id,
        tier,
      },
      { onConflict: "anchor_model_name,competitor_product_id" }
    );
  if (mErr) {
    return NextResponse.json({ error: "Matchup save failed", details: mErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, competitorProductId: cp.id });
}

export async function PATCH(request: Request) {
  const denied = await gate("battlecard.edit");
  if (denied) return denied;

  const { anchorModelName, competitorProductId, tier } = (await request.json()) as {
    anchorModelName?: string;
    competitorProductId?: string;
    tier?: number;
  };
  if (!anchorModelName || !competitorProductId || !tier || ![1, 2, 3].includes(tier)) {
    return NextResponse.json({ error: "Missing/invalid fields" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("competitor_matchups")
    .update({ tier })
    .eq("anchor_model_name", anchorModelName)
    .eq("competitor_product_id", competitorProductId);
  if (error) {
    return NextResponse.json({ error: "Tier update failed", details: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await gate("battlecard.edit");
  if (denied) return denied;

  const { anchorModelName, competitorProductId } = (await request.json()) as {
    anchorModelName?: string;
    competitorProductId?: string;
  };
  if (!anchorModelName || !competitorProductId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createAdminClient();
  // Remove just this matchup. The competitor_product + its values are left
  // intact (the same product may be matched against other anchors).
  const { error } = await supabase
    .from("competitor_matchups")
    .delete()
    .eq("anchor_model_name", anchorModelName)
    .eq("competitor_product_id", competitorProductId);
  if (error) {
    return NextResponse.json({ error: "Remove failed", details: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
