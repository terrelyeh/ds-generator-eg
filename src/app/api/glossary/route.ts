import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface GlossaryRow {
  id: string;
  english_term: string;
  locale: string;
  translated_term: string;
  scope: string;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/glossary?locale=ja&scope=global
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");
  const scope = searchParams.get("scope");

  const supabase = createAdminClient();

  let query = supabase
    .from("translation_glossary" as "products")
    .select("*")
    .order("english_term");

  if (locale) {
    query = query.eq("locale", locale);
  }
  if (scope && scope !== "all") {
    query = query.eq("scope", scope);
  }

  const { data, error } = (await query) as { data: GlossaryRow[] | null; error: unknown };

  if (error) {
    return NextResponse.json({ error: "Failed to fetch glossary" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, glossary: data ?? [] });
}

/**
 * POST /api/glossary
 * Add or update a glossary term.
 * Body: { english_term, locale, translated_term, scope?, source?, notes? }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { english_term, locale, translated_term, scope = "global", source = "manual", notes, expected_updated_at } = body as {
    english_term: string;
    locale: string;
    translated_term: string;
    scope?: string;
    source?: string;
    notes?: string;
    expected_updated_at?: string | null;
  };

  if (!english_term || !locale || !translated_term) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Optimistic locking: check if this term was modified since we loaded
  if (expected_updated_at) {
    const { data: current } = await supabase
      .from("translation_glossary" as "products")
      .select("updated_at")
      .eq("english_term", english_term.trim())
      .eq("locale", locale)
      .eq("scope", scope)
      .single() as { data: { updated_at: string } | null };

    if (current?.updated_at && current.updated_at > expected_updated_at) {
      return NextResponse.json(
        { error: "This glossary term was modified by another user. Please reload and try again." },
        { status: 409 }
      );
    }
  }

  const { error } = await supabase
    .from("translation_glossary" as "products")
    .upsert(
      {
        english_term: english_term.trim(),
        locale,
        translated_term: translated_term.trim(),
        scope,
        source,
        notes: notes?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "english_term,locale,scope" }
    );

  if (error) {
    return NextResponse.json({ error: "Save failed", details: String(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/glossary
 * Body: { id: string }
 */
export async function DELETE(request: Request) {
  const body = await request.json();
  const { id } = body as { id: string };

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("translation_glossary" as "products")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
