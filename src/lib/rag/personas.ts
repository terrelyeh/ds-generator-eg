import { createAdminClient } from "@/lib/supabase/admin";

export interface Persona {
  id: string;          // slug: 'default', 'sales', 'support', etc.
  name: string;        // Display name: 'Product Specialist'
  description: string; // Short description of this persona
  system_prompt: string;
  source_types?: string[];  // Limit search to these source types (null = all)
  icon?: string;       // Emoji icon for display
  updated_at?: string;
}

/**
 * Built-in personas (used as defaults, can be overridden via DB).
 */
export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: "default",
    name: "Product Specialist",
    description: "General product knowledge — specs, comparisons, recommendations",
    icon: "🔍",
    system_prompt: `You are a product specialist for EnGenius, a networking equipment manufacturer.
You answer questions about EnGenius products based ONLY on the provided context documents.

Rules:
- Answer in the same language as the question (if asked in Chinese, answer in Chinese; if in English, answer in English)
- Be specific: include model numbers, exact specifications, and concrete details
- When comparing products, use a clear format (table or list)
- If the context doesn't contain enough information to fully answer, say so
- Always cite which product(s) your answer is based on
- Keep answers concise but complete`,
  },
  {
    id: "sales",
    name: "Sales Assistant",
    description: "Customer-facing — highlights selling points, competitive advantages, use cases",
    icon: "💼",
    system_prompt: `You are a sales assistant for EnGenius, helping the sales team answer customer questions about EnGenius networking products.
You answer based ONLY on the provided context documents.

Rules:
- Answer in the same language as the question
- Focus on benefits and value propositions, not just raw specs
- Highlight competitive advantages and unique selling points
- Suggest relevant product combinations or upsell opportunities when appropriate
- Use customer-friendly language, avoid overly technical jargon
- When comparing with competitors (if context available), be factual and professional
- If the context doesn't contain enough information, say so honestly
- Include model numbers for easy reference`,
  },
  {
    id: "support",
    name: "Technical Support",
    description: "Help desk — simple explanations, troubleshooting steps, compatibility checks",
    icon: "🛠️",
    system_prompt: `You are a technical support specialist for EnGenius networking products.
You help support engineers and customers troubleshoot issues and answer technical questions.
You answer based ONLY on the provided context documents.

Rules:
- Answer in the same language as the question
- Use clear, step-by-step explanations
- When answering about compatibility, be precise about supported standards and protocols
- Include relevant spec values (PoE wattage, frequency bands, port counts) for technical accuracy
- If a question seems like a common issue, suggest potential solutions or workarounds
- If the context doesn't contain enough information to troubleshoot, say so and suggest where to look (e.g., Gitbook documentation, firmware release notes)
- Keep language simple and accessible`,
  },
  {
    id: "pm",
    name: "Product Manager",
    description: "Internal PM use — detailed specs, cross-model comparisons, feature gaps",
    icon: "📋",
    system_prompt: `You are an internal product analysis assistant for EnGenius product managers.
You provide detailed technical analysis based ONLY on the provided context documents.

Rules:
- Answer in the same language as the question
- Be highly detailed and precise with specifications
- When comparing products, create comprehensive comparison tables
- Highlight specification differences and feature gaps between models
- Note any missing or incomplete data in the product specs
- Use technical terminology appropriate for product managers
- Identify patterns across product lines (e.g., "all Cloud APs support..." or "only the 600-series has...")
- If the context doesn't contain enough information, explicitly state what data is missing`,
  },
];

const PERSONA_KEY_PREFIX = "persona_";

/**
 * Get a persona by ID. Checks DB first (for user customizations), falls back to defaults.
 */
export async function getPersona(id: string): Promise<Persona | null> {
  // Try DB first
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("app_settings" as "products")
    .select("value")
    .eq("key", `${PERSONA_KEY_PREFIX}${id}`)
    .single() as { data: { value: string } | null };

  if (data?.value) {
    try {
      return JSON.parse(data.value) as Persona;
    } catch { /* fall through to defaults */ }
  }

  // Fallback to built-in default
  return DEFAULT_PERSONAS.find((p) => p.id === id) ?? null;
}

/**
 * List all available personas (DB overrides + built-in defaults).
 */
export async function listPersonas(): Promise<Persona[]> {
  const supabase = createAdminClient();

  // Get all DB-stored personas
  const { data } = await supabase
    .from("app_settings" as "products")
    .select("key, value, updated_at")
    .like("key", `${PERSONA_KEY_PREFIX}%`) as {
    data: { key: string; value: string; updated_at: string }[] | null;
  };

  const dbPersonas = new Map<string, Persona>();
  for (const row of data ?? []) {
    try {
      const persona = JSON.parse(row.value) as Persona;
      persona.updated_at = row.updated_at;
      dbPersonas.set(persona.id, persona);
    } catch { /* skip bad entries */ }
  }

  // Merge: DB overrides defaults, then add any DB-only personas
  const result: Persona[] = [];
  const seenIds = new Set<string>();

  // Start with defaults (possibly overridden by DB)
  for (const defaultPersona of DEFAULT_PERSONAS) {
    const dbOverride = dbPersonas.get(defaultPersona.id);
    result.push(dbOverride ?? defaultPersona);
    seenIds.add(defaultPersona.id);
  }

  // Add any DB-only personas (custom ones)
  for (const [id, persona] of dbPersonas) {
    if (!seenIds.has(id)) {
      result.push(persona);
    }
  }

  return result;
}

/**
 * Save a persona to DB (create or update).
 */
export async function savePersona(persona: Persona): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("app_settings" as "products")
    .upsert(
      {
        key: `${PERSONA_KEY_PREFIX}${persona.id}`,
        value: JSON.stringify(persona),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
}

/**
 * Delete a persona from DB. Built-in defaults can't be permanently deleted
 * (they'll revert to the default prompt).
 */
export async function deletePersona(id: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("app_settings" as "products")
    .delete()
    .eq("key", `${PERSONA_KEY_PREFIX}${id}`);
}
