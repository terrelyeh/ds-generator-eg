import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { decryptKey } from "@/lib/auth/api-key";
import { verifyPasscode } from "@/lib/auth/passcode";

/**
 * POST /api/ask-workspaces/passcode   { id }  →  { passcode, viewable }
 *
 * Admins need to hand a workspace's passcode to whoever will use it. The hash
 * can't give it back, so since migration 00059 it is also stored AES-encrypted
 * (the scheme api_keys and BYOK keys use) and decrypted here — on request
 * only; the list endpoint never carries it. POST rather than GET so it isn't
 * cached or prefetched, and the response is no-store.
 *
 * The decrypted value is checked against the hash before it is shown: if the
 * two ever disagree the copy is stale, and a wrong passcode handed to a
 * branch office is worse than "set it again". Passcodes set before 00059 have
 * only the hash and answer viewable: false.
 */
export async function POST(request: Request) {
  const denied = await gate("settings.manage_api_access");
  if (denied) return denied;

  const { id } = ((await request.json().catch(() => ({}))) ?? {}) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = (await supabase
    .from("ask_workspaces" as "products")
    .select("passcode_hash, passcode_encrypted")
    .eq("id", id)
    .maybeSingle()) as {
    data: { passcode_hash: string | null; passcode_encrypted: string | null } | null;
    error: unknown;
  };
  if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const noStore = { headers: { "Cache-Control": "no-store" } };
  if (!data.passcode_hash) {
    return NextResponse.json({ ok: true, passcode: null, viewable: false, reason: "no_passcode" }, noStore);
  }
  const passcode = decryptKey(data.passcode_encrypted);
  if (!passcode || !verifyPasscode(passcode, data.passcode_hash)) {
    return NextResponse.json({ ok: true, passcode: null, viewable: false, reason: "not_recoverable" }, noStore);
  }
  return NextResponse.json({ ok: true, passcode, viewable: true }, noStore);
}
