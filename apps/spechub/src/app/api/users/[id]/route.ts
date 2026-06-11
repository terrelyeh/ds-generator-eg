/**
 * PATCH /api/users/[id] — admin updates an active user's role.
 * DELETE /api/users/[id] — admin removes an active user.
 *
 * Self-protection rules (enforced server-side, also surfaced in UI):
 *   - Admin can't change their own role.
 *   - Admin can't remove themselves.
 *   - Can't drop the last admin (count admins before allowing).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, AuthError } from "@/lib/auth/session";
import { isRole } from "@/lib/auth/permissions";

async function adminCount(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw error;
  return count ?? 0;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requirePermission("users.update_role");
    const { id } = await params;

    if (id === me.id) {
      return NextResponse.json(
        { error: "You can't change your own role" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as Partial<{ role: string }>;
    const role = body.role;
    if (!role || !isRole(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Don't drop the last admin via demotion.
    if (role !== "admin") {
      const { data: target } = await admin
        .from("profiles")
        .select("role")
        .eq("id", id)
        .maybeSingle();
      if ((target as { role?: string } | null)?.role === "admin") {
        if ((await adminCount()) <= 1) {
          return NextResponse.json(
            { error: "Can't demote the last admin" },
            { status: 400 }
          );
        }
      }
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", id);
    if (profileErr) throw profileErr;

    // Mirror to whitelist so a future re-invite uses the latest role.
    const { data: prof } = await admin
      .from("profiles")
      .select("email")
      .eq("id", id)
      .maybeSingle();
    const email = (prof as { email?: string } | null)?.email;
    if (email) {
      await admin
        .from("email_whitelist")
        .update({ role })
        .eq("email", email.toLowerCase());
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/users/[id] PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requirePermission("users.remove");
    const { id } = await params;

    if (id === me.id) {
      return NextResponse.json(
        { error: "You can't remove yourself" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: target } = await admin
      .from("profiles")
      .select("role, email")
      .eq("id", id)
      .maybeSingle();
    const targetRow = target as { role?: string; email?: string } | null;
    if (!targetRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (targetRow.role === "admin" && (await adminCount()) <= 1) {
      return NextResponse.json(
        { error: "Can't remove the last admin" },
        { status: 400 }
      );
    }

    // Delete the auth user — CASCADE on profiles.id FK removes the profile
    // row automatically. Also strip the whitelist so they aren't auto-let
    // back in on next sign-in.
    const { error: authErr } = await admin.auth.admin.deleteUser(id);
    if (authErr) throw authErr;

    if (targetRow.email) {
      await admin
        .from("email_whitelist")
        .delete()
        .eq("email", targetRow.email.toLowerCase());
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/users/[id] DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
