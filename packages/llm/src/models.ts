/**
 * The model catalog — which models the pickers offer, and which is the
 * default per surface. Replaces two hardcoded lists in two apps.
 *
 * Slug-keyed on purpose. The old per-app ids were stable keys whose
 * display names drifted from what they actually invoked (`gpt-4o` called
 * gpt-5.5), so a stored value told you nothing about the model used.
 *
 * See 00035_llm_models_catalog.sql.
 */
import type { Surface } from "./openrouter";

/**
 * Surfaces a model can be offered on. Lives here rather than in either
 * app because both the admin editor (engenie) and the translate picker
 * (spechub) validate against it.
 */
export const SUPPORTED_SURFACES = ["translate", "ask"] as const;
export type ModelSurface = (typeof SUPPORTED_SURFACES)[number];

export interface ModelRow {
  slug: string;
  label: string;
  surfaces: string[];
  default_for: string[];
  reasoning_effort: "none" | "minimal" | "low" | "medium" | "high" | null;
  enabled: boolean;
  sort_order: number;
  /** Editorial badge for the picker — "Strongest" / "Mainstream" / "Best CP". */
  tier: string | null;
  note: string | null;
}

/**
 * Vendor label for grouping in a picker, derived from the slug's prefix
 * rather than stored. The slug already carries it, and a second field
 * would be one more thing to keep in step.
 */
export function vendorOf(slug: string): string {
  const vendor = slug.split("/")[0] ?? "";
  return { anthropic: "Claude", openai: "GPT", google: "Gemini" }[vendor] ?? vendor;
}

/**
 * Read on every Ask request and every translate page load, so it's cached
 * like the other hot lookups. Invalidated by the admin write path — a
 * model change should show up immediately, not up to a minute later.
 */
let cache: { at: number; rows: ModelRow[] } | null = null;
const TTL_MS = 60_000;

export function invalidateModelCache(): void {
  cache = null;
}

async function loadAll(): Promise<ModelRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const { createAdminClient } = await import("@eg/db/admin");
  const { data, error } = await createAdminClient()
    .from("llm_models" as "products")
    .select("slug, label, surfaces, default_for, reasoning_effort, enabled, sort_order, tier, note")
    .order("sort_order");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as ModelRow[];
  cache = { at: Date.now(), rows };
  return rows;
}

/**
 * Every enabled model, whatever surface it is offered on.
 *
 * For pickers that choose a model for a feature rather than for one of the
 * catalog's surfaces — Tender Datasheets picks its own intake and extraction
 * models, and requiring an admin to first tick a surface in another app
 * before the model appeared would make that a two-app errand.
 */
export async function listEnabledModels(): Promise<ModelRow[]> {
  return (await loadAll()).filter((m) => m.enabled);
}

/** Enabled models offered on a surface, in display order. */
export async function listModels(surface: Surface | "translate"): Promise<ModelRow[]> {
  const rows = await loadAll();
  return rows.filter((m) => m.enabled && m.surfaces.includes(surface));
}

/** Look a model up by slug — enabled or not, so an in-flight request that
 *  names a just-disabled model still resolves rather than erroring. */
export async function getModel(slug: string): Promise<ModelRow | null> {
  const rows = await loadAll();
  return rows.find((m) => m.slug === slug) ?? null;
}

/**
 * The default for a surface.
 *
 * Falls back to the first enabled model rather than throwing: a catalog
 * with no default marked is a misconfiguration, not a reason to take the
 * surface down.
 */
export async function getDefaultModel(surface: Surface | "translate"): Promise<ModelRow | null> {
  const rows = await loadAll();
  const offered = rows.filter((m) => m.enabled && m.surfaces.includes(surface));
  return offered.find((m) => m.default_for.includes(surface)) ?? offered[0] ?? null;
}

/**
 * Resolve what a request asked for into something callable: the named
 * model if it exists, otherwise the surface default. Callers pass whatever
 * arrived from the client, so an unknown or stale slug degrades to a
 * working answer instead of a 500.
 */
export async function resolveModel(
  slug: string | null | undefined,
  surface: Surface | "translate",
): Promise<ModelRow | null> {
  return pickModel(await loadAll(), slug, surface);
}

/**
 * The rule behind resolveModel, without the database.
 *
 * A named model is honoured only if it is enabled AND offered on this
 * surface. It used to be returned whenever the row existed, so disabling a
 * model in the catalogue did nothing for a widget that kept sending its
 * slug, and a translate-only model could be asked to run Ask.
 */
export function pickModel(
  rows: ModelRow[],
  slug: string | null | undefined,
  surface: Surface | "translate",
): ModelRow | null {
  const offered = rows.filter((m) => m.enabled && m.surfaces.includes(surface));
  if (slug) {
    const named = offered.find((m) => m.slug === slug);
    if (named) return named;
  }
  return offered.find((m) => m.default_for.includes(surface)) ?? offered[0] ?? null;
}
