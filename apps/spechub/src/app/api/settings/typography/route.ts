import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TYPOGRAPHY_DEFAULTS } from "@/lib/datasheet/typography";
import type { TypographySettings } from "@/lib/datasheet/typography";
import { gate } from "@/lib/auth/session";

/**
 * GET /api/settings/typography?locale=ja
 * Returns typography settings for a locale (merged with defaults).
 */
export async function GET(request: Request) {
  const denied = await gate("settings.edit_typography");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");

  if (!locale) {
    return NextResponse.json({ error: "Missing locale" }, { status: 400 });
  }

  const defaults = TYPOGRAPHY_DEFAULTS[locale] ?? TYPOGRAPHY_DEFAULTS["ja"];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("app_settings" as "products")
    .select("value, updated_at")
    .eq("key", `typography_${locale}`)
    .single() as { data: { value: string; updated_at: string } | null };

  let settings: TypographySettings = { ...defaults };
  if (data?.value) {
    try {
      const saved = JSON.parse(data.value);
      settings = { ...defaults, ...saved };
    } catch {
      // ignore bad JSON
    }
  }

  return NextResponse.json({ ok: true, settings, defaults, updated_at: data?.updated_at ?? null });
}

/**
 * POST /api/settings/typography
 * Save typography settings for a locale.
 * Body: { locale: string, settings: Partial<TypographySettings> }
 */
export async function POST(request: Request) {
  const denied = await gate("settings.edit_typography");
  if (denied) return denied;
  const body = await request.json();
  const { locale, settings, expected_updated_at } = body as {
    locale: string;
    settings: Partial<TypographySettings>;
    expected_updated_at?: string | null;
  };

  if (!locale || !settings) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Optimistic locking: check if someone else saved since we loaded
  if (expected_updated_at) {
    const { data: current } = await supabase
      .from("app_settings" as "products")
      .select("updated_at")
      .eq("key", `typography_${locale}`)
      .single() as { data: { updated_at: string } | null };

    if (current?.updated_at && current.updated_at > expected_updated_at) {
      return NextResponse.json(
        { error: "Settings were modified by another user. Please reload and try again." },
        { status: 409 }
      );
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("app_settings" as "products")
    .upsert(
      {
        key: `typography_${locale}`,
        value: JSON.stringify(settings),
        updated_at: now,
      },
      { onConflict: "key" }
    );

  if (error) {
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated_at: now });
}

/**
 * DELETE /api/settings/typography?locale=ja
 * Reset typography settings to defaults.
 */
export async function DELETE(request: Request) {
  const denied = await gate("settings.edit_typography");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");

  if (!locale) {
    return NextResponse.json({ error: "Missing locale" }, { status: 400 });
  }

  const supabase = createAdminClient();

  await supabase
    .from("app_settings" as "products")
    .delete()
    .eq("key", `typography_${locale}`);

  return NextResponse.json({ ok: true });
}
