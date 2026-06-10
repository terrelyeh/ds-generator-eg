/**
 * Ask workspace loading + types (server-side; uses the admin client).
 * A workspace = a department's own /ask/<slug> entry: passcode, LLM mode,
 * knowledge scope, persona/profile, welcome.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { TaxonomyMeta } from "@/lib/rag/taxonomy";

export interface WorkspaceScope extends Partial<TaxonomyMeta> {
  source_types?: string[];
  /** Extra kind='knowledge' areas (solution slugs) to include on top of the
   *  product scope, e.g. a department's SOP/onboarding area. */
  knowledge_areas?: string[];
}

export interface AskWorkspace {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  passcode_hash: string | null;
  llm_mode: "shared" | "byok" | "user_byok";
  provider: string;
  byok_provider: string | null;
  byok_key_encrypted: string | null;
  scope: WorkspaceScope;
  persona: string;
  profile: string;
  allow_switch: boolean;
  welcome_subtitle: string | null;
  welcome_description: string | null;
  example_questions: string[] | null;
  rate_limit_per_min: number;
  daily_limit: number | null;
}

const FIELDS =
  "id, slug, name, enabled, passcode_hash, llm_mode, provider, byok_provider, byok_key_encrypted, scope, persona, profile, allow_switch, welcome_subtitle, welcome_description, example_questions, rate_limit_per_min, daily_limit";

/** Load a workspace by slug (returns null if not found). Caller checks `enabled`. */
export async function loadWorkspaceBySlug(slug: string): Promise<AskWorkspace | null> {
  if (!slug) return null;
  const supabase = createAdminClient();
  const { data } = (await supabase
    .from("ask_workspaces" as "products")
    .select(FIELDS)
    .eq("slug", slug)
    .maybeSingle()) as { data: AskWorkspace | null };
  return data ?? null;
}

/** Public-safe view of a workspace config (no secrets) for the chat UI. */
export function publicWorkspace(w: AskWorkspace) {
  return {
    slug: w.slug,
    name: w.name,
    persona: w.persona,
    profile: w.profile,
    allow_switch: w.allow_switch,
    provider: w.provider,
    // Mode + key family so the UI knows whether to prompt the user for their
    // own key (user_byok) and which provider that key must belong to.
    llm_mode: w.llm_mode,
    byok_provider: w.byok_provider,
    welcome_subtitle: w.welcome_subtitle,
    welcome_description: w.welcome_description,
    example_questions: Array.isArray(w.example_questions) ? w.example_questions : null,
  };
}
