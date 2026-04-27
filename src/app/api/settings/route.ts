import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate } from "@/lib/auth/session";

/**
 * GET /api/settings?keys=anthropic_api_key,openai_api_key,...
 * Returns settings with values masked (only last 4 chars visible).
 */
export async function GET(request: Request) {
  const denied = await gate("settings.edit_api_keys");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const keys = searchParams.get("keys")?.split(",") ?? [];

  if (keys.length === 0) {
    return NextResponse.json({ error: "No keys specified" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("app_settings" as "products")
    .select("key, value, updated_at")
    .in("key", keys) as { data: { key: string; value: string; updated_at: string }[] | null };

  // Mask values — only show if key exists and last 4 chars
  const masked = keys.map((k) => {
    const row = (data ?? []).find((r) => r.key === k);
    if (!row) return { key: k, hasValue: false, masked: "", updated_at: null };
    const val = row.value;
    const masked = val.length > 8
      ? "•".repeat(val.length - 4) + val.slice(-4)
      : "•".repeat(val.length);
    return { key: k, hasValue: true, masked, updated_at: row.updated_at };
  });

  return NextResponse.json({ ok: true, settings: masked });
}

/**
 * POST /api/settings
 * Save settings.
 * Body: { settings: { key: string, value: string }[] }
 */
export async function POST(request: Request) {
  const denied = await gate("settings.edit_api_keys");
  if (denied) return denied;
  const body = await request.json();
  const { settings, expected_updated_at } = body as {
    settings: { key: string; value: string }[];
    expected_updated_at?: Record<string, string>;
  };

  if (!settings || settings.length === 0) {
    return NextResponse.json({ error: "No settings" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Optimistic locking: check if any key was modified since we loaded
  if (expected_updated_at) {
    const keysToCheck = Object.keys(expected_updated_at);
    if (keysToCheck.length > 0) {
      const { data: currentRows } = await supabase
        .from("app_settings" as "products")
        .select("key, updated_at")
        .in("key", keysToCheck) as { data: { key: string; updated_at: string }[] | null };

      for (const row of currentRows ?? []) {
        const expected = expected_updated_at[row.key];
        if (expected && row.updated_at > expected) {
          return NextResponse.json(
            { error: "Settings were modified by another user. Please reload and try again." },
            { status: 409 }
          );
        }
      }
    }
  }

  const now = new Date().toISOString();

  for (const s of settings) {
    if (!s.value || s.value.trim().length === 0) continue;

    // Skip if value is all dots (masked value sent back unchanged)
    if (/^•+/.test(s.value)) continue;

    await supabase
      .from("app_settings" as "products")
      .upsert(
        { key: s.key, value: s.value.trim(), updated_at: now },
        { onConflict: "key" }
      );
  }

  return NextResponse.json({ ok: true });
}
