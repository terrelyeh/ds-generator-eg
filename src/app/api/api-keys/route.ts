import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate, getCurrentUser } from "@/lib/auth/session";
import { generateApiKey, type ApiKeyScope } from "@/lib/auth/api-key";

/**
 * Admin management of external API keys (department RAG Search access).
 * All operations require `settings.manage_api_access` (admin-only).
 * The plaintext key is returned exactly once, on creation.
 */

const PERMISSION = "settings.manage_api_access" as const;

function normalizeScope(input: unknown): ApiKeyScope {
  const s = (input ?? {}) as Partial<ApiKeyScope>;
  return {
    solution: s.solution ?? null,
    product_lines: Array.isArray(s.product_lines) ? s.product_lines : [],
    models: Array.isArray(s.models) ? s.models : [],
    source_types: Array.isArray(s.source_types) ? s.source_types : [],
  };
}

export async function GET() {
  const denied = await gate(PERMISSION);
  if (denied) return denied;

  const supabase = createAdminClient();
  const { data, error } = (await supabase
    .from("api_keys" as "products")
    .select(
      "id, name, key_prefix, scope, rate_limit_per_min, enabled, created_at, last_used_at, request_count, note",
    )
    .order("created_at", { ascending: false })) as { data: unknown[] | null; error: unknown };

  if (error) return NextResponse.json({ error: "Failed to list keys" }, { status: 500 });
  return NextResponse.json({ ok: true, keys: data ?? [] });
}

export async function POST(request: Request) {
  const denied = await gate(PERMISSION);
  if (denied) return denied;
  const user = await getCurrentUser();

  const body = (await request.json()) as {
    name?: string;
    scope?: ApiKeyScope;
    rate_limit_per_min?: number;
    note?: string;
  };
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const { plaintext, prefix, hash } = generateApiKey();
  const rate = Math.min(Math.max(Math.floor(Number(body.rate_limit_per_min) || 60), 1), 6000);

  const supabase = createAdminClient();
  const { data, error } = (await supabase
    .from("api_keys" as "products")
    .insert({
      name,
      key_prefix: prefix,
      key_hash: hash,
      scope: normalizeScope(body.scope),
      rate_limit_per_min: rate,
      note: body.note?.trim() || null,
      created_by: user?.id ?? null,
    } as Record<string, unknown>)
    .select("id")
    .single()) as { data: { id: string } | null; error: unknown };

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }

  // Plaintext is returned ONCE here and never stored.
  return NextResponse.json({ ok: true, id: data.id, key: plaintext, key_prefix: prefix });
}

export async function PATCH(request: Request) {
  const denied = await gate(PERMISSION);
  if (denied) return denied;

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    enabled?: boolean;
    scope?: ApiKeyScope;
    rate_limit_per_min?: number;
    note?: string;
  };
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (body.scope) update.scope = normalizeScope(body.scope);
  if (body.rate_limit_per_min != null) {
    update.rate_limit_per_min = Math.min(Math.max(Math.floor(Number(body.rate_limit_per_min)), 1), 6000);
  }
  if (typeof body.note === "string") update.note = body.note.trim() || null;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("api_keys" as "products")
    .update(update)
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await gate(PERMISSION);
  if (denied) return denied;

  const body = (await request.json()) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from("api_keys" as "products").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
