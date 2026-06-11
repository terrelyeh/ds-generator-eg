/**
 * GET /api/users — list active users + pending invites.
 *
 * Admin-only. Uses service-role client to bypass RLS so we don't have to
 * worry about the recursion-prone admin policies for this read.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, AuthError } from "@/lib/auth/session";

export async function GET() {
  try {
    await requirePermission("users.view");

    const admin = createAdminClient();

    // Active users — anyone with a profile row.
    const { data: profilesData, error: profilesErr } = await admin
      .from("profiles")
      .select("id, email, name, avatar_url, role, last_sign_in_at, created_at")
      .order("last_sign_in_at", { ascending: false, nullsFirst: false });

    if (profilesErr) throw profilesErr;

    // Pending invites — whitelist entries WITHOUT a corresponding profile.
    const { data: whitelistData, error: whitelistErr } = await admin
      .from("email_whitelist")
      .select("email, role, invited_at, invited_by, note")
      .order("invited_at", { ascending: false });

    if (whitelistErr) throw whitelistErr;

    const profiles = (profilesData ?? []) as Array<{
      id: string;
      email: string;
      name: string | null;
      avatar_url: string | null;
      role: string;
      last_sign_in_at: string | null;
      created_at: string;
    }>;
    const whitelist = (whitelistData ?? []) as Array<{
      email: string;
      role: string;
      invited_at: string;
      invited_by: string | null;
      note: string | null;
    }>;

    const activeEmails = new Set(profiles.map((p) => p.email.toLowerCase()));
    const pending = whitelist.filter(
      (w) => !activeEmails.has(w.email.toLowerCase())
    );

    // Build a lookup of inviter emails so the UI can show "Invited by Tom".
    let inviterMap: Record<string, string> = {};
    const inviterIds = pending
      .map((p) => p.invited_by)
      .filter((id): id is string => Boolean(id));
    if (inviterIds.length > 0) {
      const { data: inviters } = await admin
        .from("profiles")
        .select("id, name, email")
        .in("id", inviterIds);
      const inviterRows = (inviters ?? []) as Array<{
        id: string;
        name: string | null;
        email: string;
      }>;
      inviterMap = Object.fromEntries(
        inviterRows.map((p) => [p.id, p.name || p.email])
      );
    }

    return NextResponse.json({
      active: profiles,
      pending: pending.map((p) => ({
        ...p,
        invited_by_name: p.invited_by ? inviterMap[p.invited_by] ?? null : null,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/users GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
