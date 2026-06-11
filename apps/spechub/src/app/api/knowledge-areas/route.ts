import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";

/**
 * Knowledge Areas = non-product, kind='knowledge' solutions (department SOPs,
 * onboarding, cross-team shared knowledge). They're a top-level bucket for
 * tagging knowledge + scoping Ask workspaces. This is their CRUD; product
 * solutions are managed elsewhere (seeded with the product hierarchy).
 */

/** Colon-free slug; falls back to a random one for non-latin (e.g. CJK) names. */
function slugify(label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  return base || `dept-${Math.random().toString(36).slice(2, 7)}`;
}

export async function GET() {
  const denied = await gate("knowledge.edit");
  if (denied) return denied;
  const supabase = createAdminClient();
  const { data, error } = (await supabase
    .from("solutions")
    .select("slug, label")
    .eq("kind", "knowledge")
    .order("sort_order")) as { data: { slug: string; label: string }[] | null; error: unknown };
  if (error) return NextResponse.json({ error: "Failed to list areas" }, { status: 500 });
  return NextResponse.json({ ok: true, areas: data ?? [] });
}

export async function POST(request: Request) {
  const denied = await gate("knowledge.edit");
  if (denied) return denied;
  const body = (await request.json()) as { label?: string; slug?: string };
  const label = (body.label || "").trim();
  if (!label) return NextResponse.json({ error: "Missing label" }, { status: 400 });

  const provided = (body.slug || "").trim().toLowerCase();
  if (provided && !/^[a-z0-9-]+$/.test(provided)) {
    return NextResponse.json({ error: "Slug must be lowercase letters, numbers, hyphens" }, { status: 400 });
  }
  let slug = provided || slugify(label);

  const supabase = createAdminClient();
  const row = () => ({ slug, name: label, label, kind: "knowledge", sort_order: 200, color_primary: "#475569" });
  let { error } = (await supabase.from("solutions").insert(row())) as { error: { code?: string } | null };
  if (error?.code === "23505") {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    ({ error } = (await supabase.from("solutions").insert(row())) as { error: { code?: string } | null });
  }
  if (error) return NextResponse.json({ error: "Failed to create area" }, { status: 500 });
  return NextResponse.json({ ok: true, slug, label });
}

export async function DELETE(request: Request) {
  const denied = await gate("knowledge.edit");
  if (denied) return denied;
  const { slug } = (await request.json()) as { slug?: string };
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  const supabase = createAdminClient();
  // Only knowledge areas can be deleted here (never a product solution).
  const { error } = await supabase.from("solutions").delete().eq("slug", slug).eq("kind", "knowledge");
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
