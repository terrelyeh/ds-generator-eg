import { NextResponse } from "next/server";
import {
  listPersonas,
  savePersona,
  deletePersona,
  DEFAULT_PERSONAS,
} from "@/lib/rag/personas";
import type { Persona } from "@/lib/rag/personas";
import { gate } from "@/lib/auth/session";

/**
 * GET /api/personas
 * List all personas (built-in defaults + custom).
 */
export async function GET() {
  const personas = await listPersonas();
  const defaultIds = new Set(DEFAULT_PERSONAS.map((p) => p.id));

  return NextResponse.json({
    ok: true,
    personas: personas.map((p) => ({
      ...p,
      is_default: defaultIds.has(p.id),
    })),
  });
}

/**
 * POST /api/personas
 * Create or update a persona.
 * Body: { id, name, description, system_prompt, icon?, source_types? }
 */
export async function POST(request: Request) {
  const denied = await gate("settings.edit_personas");
  if (denied) return denied;
  const body = await request.json();
  const { id, name, system_prompt, description, icon, source_types } = body as Partial<Persona>;

  if (!id || !name || !system_prompt) {
    return NextResponse.json(
      { error: "Missing required fields: id, name, system_prompt" },
      { status: 400 }
    );
  }

  // Validate id format (slug: lowercase, alphanumeric + hyphens)
  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json(
      { error: "Persona ID must be lowercase alphanumeric with hyphens only" },
      { status: 400 }
    );
  }

  const persona: Persona = {
    id,
    name,
    description: description || "",
    system_prompt,
    icon: icon || "🤖",
    source_types: source_types || undefined,
  };

  await savePersona(persona);

  return NextResponse.json({ ok: true, persona });
}

/**
 * DELETE /api/personas
 * Delete a custom persona (resets built-in ones to defaults).
 * Body: { id: string }
 */
export async function DELETE(request: Request) {
  const denied = await gate("settings.edit_personas");
  if (denied) return denied;
  const body = await request.json();
  const { id } = body as { id: string };

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await deletePersona(id);

  return NextResponse.json({ ok: true });
}
