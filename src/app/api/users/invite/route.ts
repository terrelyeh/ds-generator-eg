/**
 * POST /api/users/invite — admin invites a new user by email.
 *
 * Body: { email: string, role: Role }
 *
 * Writes a row into email_whitelist. The user becomes "Active" once they
 * sign in for the first time and the auth.users insert trigger creates
 * a matching profile row.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, AuthError } from "@/lib/auth/session";
import { isRole } from "@/lib/auth/permissions";

export async function POST(request: NextRequest) {
  try {
    const inviter = await requirePermission("users.invite");

    const body = (await request.json()) as Partial<{
      email: string;
      role: string;
    }>;

    const email = body.email?.trim().toLowerCase();
    const role = body.role;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }
    if (!role || !isRole(role)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Reject if this email is already an active user (has profile).
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "This email already has an active account" },
        { status: 409 }
      );
    }

    // Upsert the whitelist row. If they were already invited, just refresh
    // the role (admin might be raising/lowering the role they were invited
    // at). invited_by/invited_at get updated to reflect the latest action.
    const { error } = await admin
      .from("email_whitelist")
      .upsert(
        {
          email,
          role,
          invited_by: inviter.id,
          invited_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );

    if (error) throw error;

    return NextResponse.json({ ok: true, email, role });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/users/invite POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
