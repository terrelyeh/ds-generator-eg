/**
 * DELETE /api/users/whitelist/[email] — admin cancels a pending invite.
 * Used by the "Cancel Invite" button on rows that haven't logged in yet.
 *
 * The email is URL-encoded; `params.email` may also still be encoded —
 * normalise via decodeURIComponent + lowercase before delete.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, AuthError } from "@/lib/auth/session";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    await requirePermission("users.remove");
    const { email } = await params;
    const normalized = decodeURIComponent(email).trim().toLowerCase();

    const admin = createAdminClient();

    // Refuse to cancel an invite for someone who has already signed in
    // (i.e. has a profile). They should be removed via the user route.
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", normalized)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "User has already signed in; remove them via Active Users." },
        { status: 400 }
      );
    }

    const { error } = await admin
      .from("email_whitelist")
      .delete()
      .eq("email", normalized);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/users/whitelist DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
