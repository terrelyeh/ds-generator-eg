import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { listModels, invalidateModelCache, SUPPORTED_SURFACES } from "@eg/llm/models";
import { getCurrentUser } from "@eg/auth/session";
import { can } from "@eg/auth/permissions";

/**
 * The model catalog — admin surface.
 *
 * Lives in EnGenie because that is where LLM configuration already sits
 * (API keys, spend). It was briefly in SpecHub for the shallow reason
 * that the surface enum lived there; splitting AI settings across two
 * apps just made the page hard to find.
 *
 * SpecHub keeps its own read-only copy of the surface-filtered GET for
 * the translation picker — both apps share the database, so each reads
 * directly rather than calling across.
 *
 * GET  ?surface=translate  → models offered on that surface (no session —
 *                            passcode surfaces need it too, see below)
 * GET                      → every row, admin only (the management view)
 * PUT  { models: [...] }   → replace the catalog, admin only
 *
 * Editing is admin-only because a bad slug here breaks translation and Ask
 * at once; reading is not, because the picker is part of ordinary use.
 */

export async function GET(request: Request) {
  const surface = new URL(request.url).searchParams.get("surface");

  // The surface-filtered read needs no session. The Ask picker also runs on
  // the passcode-gated surfaces (/demo, /ask/<slug>, /embed/<slug>) which
  // carry a workspace cookie, not a Supabase one — and it returns nothing
  // those users can't already see, since it IS the list their picker shows.
  // Only slug/label/tier of enabled models; nothing about keys or spend.
  if (surface) {
    if (!SUPPORTED_SURFACES.includes(surface as (typeof SUPPORTED_SURFACES)[number])) {
      return NextResponse.json({ error: `Unknown surface: ${surface}` }, { status: 400 });
    }
    const models = await listModels(surface as "translate");
    return NextResponse.json({
      ok: true,
      models: models.map((m) => ({
        slug: m.slug,
        label: m.label,
        tier: m.tier,
        default_for: m.default_for,
      })),
    });
  }

  // The full row set — including notes and sort order — stays admin-only.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "settings.edit_api_keys")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await createAdminClient()
    .from("llm_models" as "products")
    .select("id, slug, label, surfaces, default_for, reasoning_effort, enabled, sort_order, tier, note")
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, models: data ?? [] });
}

interface ModelInput {
  slug: string;
  label: string;
  surfaces: string[];
  default_for: string[];
  reasoning_effort: string | null;
  enabled: boolean;
  sort_order: number;
  tier?: string | null;
  note?: string | null;
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "settings.edit_api_keys")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const models = (body as { models?: ModelInput[] }).models;
  if (!Array.isArray(models)) {
    return NextResponse.json({ error: "Expected { models: [...] }" }, { status: 400 });
  }

  // A slug with a typo silently stops being callable, so validate shape
  // before writing rather than discovering it on the next translation.
  for (const m of models) {
    if (!m.slug?.trim() || !m.slug.includes("/")) {
      return NextResponse.json(
        { error: `"${m.slug}" is not an OpenRouter slug — expected vendor/model` },
        { status: 400 },
      );
    }
    if (!m.label?.trim()) {
      return NextResponse.json({ error: `${m.slug} needs a label` }, { status: 400 });
    }
    const bad = [...m.surfaces, ...m.default_for].filter(
      (s) => !SUPPORTED_SURFACES.includes(s as (typeof SUPPORTED_SURFACES)[number]),
    );
    if (bad.length) {
      return NextResponse.json({ error: `Unknown surface(s): ${bad.join(", ")}` }, { status: 400 });
    }
    // Being the default for a surface you aren't offered on would leave
    // that surface with a default it can never show.
    const orphan = m.default_for.filter((s) => !m.surfaces.includes(s));
    if (orphan.length) {
      return NextResponse.json(
        { error: `${m.slug} is default for ${orphan.join(", ")} but isn't offered there` },
        { status: 400 },
      );
    }
  }

  for (const surface of SUPPORTED_SURFACES) {
    const claimants = models.filter((m) => m.default_for.includes(surface));
    if (claimants.length > 1) {
      return NextResponse.json(
        { error: `Only one model can be the ${surface} default (${claimants.length} marked)` },
        { status: 400 },
      );
    }
  }

  const supabase = createAdminClient();

  // Replace wholesale: the UI edits the list as a unit, and a diff would
  // have to reason about renames it can't see.
  const keep = models.map((m) => m.slug);
  const { error: delErr } = keep.length
    ? await supabase.from("llm_models" as "products").delete().not("slug", "in", `(${keep.map((s) => `"${s}"`).join(",")})`)
    : await supabase.from("llm_models" as "products").delete().neq("slug", "");
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (models.length) {
    const { error: upErr } = await supabase.from("llm_models" as "products").upsert(
      models.map((m) => ({
        slug: m.slug.trim(),
        label: m.label.trim(),
        surfaces: m.surfaces,
        default_for: m.default_for,
        reasoning_effort: m.reasoning_effort || null,
        tier: m.tier?.trim() || null,
        enabled: m.enabled,
        sort_order: m.sort_order,
        note: m.note?.trim() || null,
        updated_at: new Date().toISOString(),
      })) as never,
      { onConflict: "slug" },
    );
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Both apps cache the catalog for 60s; without this a change wouldn't
  // take hold until the TTL lapsed.
  invalidateModelCache();

  return NextResponse.json({ ok: true, count: models.length });
}
