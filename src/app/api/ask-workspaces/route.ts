import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate, getCurrentUser } from "@/lib/auth/session";
import { encryptKey } from "@/lib/auth/api-key";

/**
 * Admin CRUD for Ask workspaces (per-department /ask/<slug> entries).
 * Requires `settings.manage_api_access` (admin). Secrets (passcode, BYOK key)
 * are write-only: stored hashed/encrypted, never returned.
 */
const PERMISSION = "settings.manage_api_access" as const;

function familyOf(provider: string): "anthropic" | "openai" | "google" {
  if (provider.startsWith("claude")) return "anthropic";
  if (provider.startsWith("gpt")) return "openai";
  return "google";
}

interface WorkspaceInput {
  id?: string;
  slug?: string;
  name?: string;
  enabled?: boolean;
  passcode?: string; // plaintext; hashed here. "" = leave unchanged on PATCH
  llm_mode?: "shared" | "byok";
  provider?: string;
  byok_key?: string; // plaintext; encrypted here. "" = leave unchanged on PATCH
  scope?: { solution?: string | null; product_lines?: string[]; models?: string[]; source_types?: string[] };
  persona?: string;
  profile?: string;
  allow_switch?: boolean;
  welcome_subtitle?: string | null;
  welcome_description?: string | null;
  example_questions?: string[] | null;
  rate_limit_per_min?: number;
  daily_limit?: number | null;
  note?: string | null;
}

export async function GET() {
  const denied = await gate(PERMISSION);
  if (denied) return denied;
  const supabase = createAdminClient();
  const { data, error } = (await supabase
    .from("ask_workspaces" as "products")
    .select(
      "id, slug, name, enabled, llm_mode, provider, byok_provider, scope, persona, profile, allow_switch, welcome_subtitle, welcome_description, example_questions, rate_limit_per_min, daily_limit, request_count, last_used_at, note, passcode_hash, byok_key_encrypted, created_at",
    )
    .order("created_at", { ascending: false })) as {
    data: ({ passcode_hash: string | null; byok_key_encrypted: string | null; [k: string]: unknown }[]) | null;
    error: unknown;
  };
  if (error) return NextResponse.json({ error: "Failed to list workspaces" }, { status: 500 });
  // Strip secrets; expose only whether they're set.
  const workspaces = (data ?? []).map(({ passcode_hash, byok_key_encrypted, ...rest }) => ({
    ...rest,
    has_passcode: !!passcode_hash,
    has_byok_key: !!byok_key_encrypted,
  }));
  return NextResponse.json({ ok: true, workspaces });
}

function normalizeScope(s: WorkspaceInput["scope"]) {
  const v = s ?? {};
  return {
    solution: v.solution ?? null,
    product_lines: Array.isArray(v.product_lines) ? v.product_lines : [],
    models: Array.isArray(v.models) ? v.models : [],
    source_types: Array.isArray(v.source_types) ? v.source_types : [],
  };
}

export async function POST(request: Request) {
  const denied = await gate(PERMISSION);
  if (denied) return denied;
  const user = await getCurrentUser();
  const body = (await request.json()) as WorkspaceInput;

  const slug = (body.slug || "").trim().toLowerCase();
  const name = (body.name || "").trim();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Slug must be lowercase letters, numbers, hyphens" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const provider = body.provider || "gemini-3.5-flash";
  const llm_mode = body.llm_mode === "byok" ? "byok" : "shared";

  const row: Record<string, unknown> = {
    slug,
    name,
    enabled: body.enabled ?? true,
    llm_mode,
    provider,
    byok_provider: llm_mode === "byok" ? familyOf(provider) : null,
    scope: normalizeScope(body.scope),
    persona: body.persona || "default",
    profile: body.profile || "default",
    allow_switch: body.allow_switch ?? true,
    welcome_subtitle: body.welcome_subtitle?.trim() || null,
    welcome_description: body.welcome_description?.trim() || null,
    example_questions: Array.isArray(body.example_questions) ? body.example_questions : null,
    rate_limit_per_min: Math.min(Math.max(Math.floor(Number(body.rate_limit_per_min) || 30), 1), 6000),
    daily_limit: body.daily_limit != null ? Math.max(Math.floor(Number(body.daily_limit)), 1) : null,
    note: body.note?.trim() || null,
    created_by: user?.id ?? null,
  };
  if (body.passcode) row.passcode_hash = createHash("sha256").update(body.passcode).digest("hex");
  if (llm_mode === "byok" && body.byok_key) row.byok_key_encrypted = encryptKey(body.byok_key);

  const supabase = createAdminClient();
  const { data, error } = (await supabase
    .from("ask_workspaces" as "products")
    .insert(row)
    .select("id")
    .single()) as { data: { id: string } | null; error: { code?: string } | null };
  if (error?.code === "23505") {
    return NextResponse.json({ error: `Slug "${slug}" already exists` }, { status: 409 });
  }
  if (error || !data) return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const denied = await gate(PERMISSION);
  if (denied) return denied;
  const body = (await request.json()) as WorkspaceInput;
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (body.llm_mode) update.llm_mode = body.llm_mode === "byok" ? "byok" : "shared";
  if (typeof body.provider === "string") update.provider = body.provider;
  if (body.scope) update.scope = normalizeScope(body.scope);
  if (typeof body.persona === "string") update.persona = body.persona;
  if (typeof body.profile === "string") update.profile = body.profile;
  if (typeof body.allow_switch === "boolean") update.allow_switch = body.allow_switch;
  if (body.welcome_subtitle !== undefined) update.welcome_subtitle = body.welcome_subtitle?.trim() || null;
  if (body.welcome_description !== undefined) update.welcome_description = body.welcome_description?.trim() || null;
  if (body.example_questions !== undefined) update.example_questions = Array.isArray(body.example_questions) ? body.example_questions : null;
  if (body.rate_limit_per_min != null) update.rate_limit_per_min = Math.min(Math.max(Math.floor(Number(body.rate_limit_per_min)), 1), 6000);
  if (body.daily_limit !== undefined) update.daily_limit = body.daily_limit != null ? Math.max(Math.floor(Number(body.daily_limit)), 1) : null;
  if (body.note !== undefined) update.note = body.note?.trim() || null;
  // Secrets: only when a non-empty value is provided.
  if (body.passcode) update.passcode_hash = createHash("sha256").update(body.passcode).digest("hex");
  if (body.byok_key) update.byok_key_encrypted = encryptKey(body.byok_key);
  // Keep byok_provider consistent with the (possibly updated) provider.
  const effProvider = (update.provider as string) ?? undefined;
  if (effProvider && (update.llm_mode === "byok" || body.llm_mode === "byok")) update.byok_provider = familyOf(effProvider);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("ask_workspaces" as "products").update(update).eq("id", body.id);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await gate(PERMISSION);
  if (denied) return denied;
  const body = (await request.json()) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from("ask_workspaces" as "products").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
