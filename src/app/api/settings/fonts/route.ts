import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/settings/fonts?locale=ja
 * Returns custom fonts for a locale.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");
  if (!locale) return NextResponse.json({ error: "Missing locale" }, { status: 400 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("app_settings" as "products")
    .select("value")
    .eq("key", `custom_fonts_${locale}`)
    .single() as { data: { value: string } | null };

  let fonts: { value: string; label: string; import: string }[] = [];
  if (data?.value) {
    try { fonts = JSON.parse(data.value); } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, fonts });
}

/**
 * POST /api/settings/fonts
 * Save custom fonts for a locale.
 * Body: { locale: string, fonts: { value, label, import }[] }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { locale, fonts } = body as {
    locale: string;
    fonts: { value: string; label: string; import: string }[];
  };

  if (!locale) return NextResponse.json({ error: "Missing locale" }, { status: 400 });

  const supabase = createAdminClient();
  await supabase
    .from("app_settings" as "products")
    .upsert(
      { key: `custom_fonts_${locale}`, value: JSON.stringify(fonts), updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  return NextResponse.json({ ok: true });
}
