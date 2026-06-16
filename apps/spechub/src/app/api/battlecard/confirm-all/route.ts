import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate, getCurrentUser } from "@eg/auth/session";

/**
 * POST /api/battlecard/confirm-all  { competitorProductIds: string[] }
 *
 * Bulk "Save & Confirm" — marks every unconfirmed, non-empty competitor cell
 * for the given competitor products as confirmed. Used by the per-table
 * "Confirm all drafts" action. Already-confirmed and empty cells are untouched.
 */
export async function POST(request: Request) {
  const denied = await gate("battlecard.edit");
  if (denied) return denied;

  const user = await getCurrentUser();
  const { competitorProductIds } = (await request.json()) as {
    competitorProductIds?: string[];
  };

  if (!Array.isArray(competitorProductIds) || competitorProductIds.length === 0) {
    return NextResponse.json({ error: "Missing competitorProductIds" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("battlecard_values")
    .update({ confirmed: true, confirmed_by: user?.id ?? null, confirmed_at: now, updated_at: now })
    .in("competitor_product_id", competitorProductIds)
    .eq("confirmed", false)
    .neq("value", "")
    .select("id");

  if (error) {
    return NextResponse.json({ error: "Confirm failed", details: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, confirmed: data?.length ?? 0 });
}
