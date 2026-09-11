/**
 * Does a model slug exist on OpenRouter? Asked when the model catalog is
 * saved (/settings/models). The shape check before it — "has a slash" — let
 * "deepseek/deepseek-v4-flash-latest" through, and that names nothing:
 * OpenRouter's always-latest aliases start with "~". Nothing said so until
 * Ask answered 400.
 *
 * Needs no key — the model list and the single-model lookup are public.
 */

const BASE = "https://openrouter.ai/api/v1";

/** author/slug, each part starting alphanumeric (so never "." or ".."). */
const SLUG_RE = /^~?[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.:-]*$/;

export interface UnknownSlug {
  slug: string;
  /** Closest ids in the catalog, best first — may be empty. */
  suggestions: string[];
}

export interface SlugCheck {
  unknown: UnknownSlug[];
  /** Some or all of the slugs couldn't be checked — OpenRouter didn't answer. */
  unverified: boolean;
}

/**
 * The list settles most slugs in one request. What it doesn't list is asked
 * about one by one, because the list leaves out forms the API still accepts
 * — variant suffixes (`:nitro`, `:online`) and renamed-model aliases — and
 * the single-model lookup resolves those.
 */
export async function findUnknownSlugs(slugs: string[]): Promise<SlugCheck> {
  let ids: string[] = [];
  try {
    const res = await fetch(`${BASE}/models`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) ids = ((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
  } catch {
    // fall through: an empty list means "couldn't check"
  }
  if (ids.length === 0) return { unknown: [], unverified: true };

  const listed = new Set(ids);
  const misses = [...new Set(slugs)].filter((s) => !listed.has(s));
  const found = await Promise.all(misses.map(async (slug) => ({ slug, exists: await lookup(slug) })));
  return {
    unknown: found
      .filter((f) => f.exists === false)
      .map(({ slug }) => ({ slug, suggestions: suggestSlugs(slug, ids) })),
    unverified: found.some((f) => f.exists === null),
  };
}

/** true = exists, false = OpenRouter says 404, null = couldn't tell. */
async function lookup(slug: string): Promise<boolean | null> {
  if (!SLUG_RE.test(slug)) return false;
  try {
    const res = await fetch(`${BASE}/model/${slug}`, { signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return false;
    return res.ok ? true : null;
  } catch {
    return null;
  }
}

/**
 * Closest catalog ids to a slug that isn't one, best first.
 *
 * The "~" is tried first and alone: an always-latest alias written without
 * it (or a pinned id written with one) is the mistake this was built for,
 * and edit distance would rank it no higher than any one-character typo.
 * Otherwise the nearest ids, the same vendor's first — a typo rarely
 * changes the vendor — measured with separators stripped before as-typed. `:batch` ids aren't chat models, so never offered.
 */
export function suggestSlugs(slug: string, ids: string[], limit = 3): string[] {
  const pool = ids.filter((id) => !id.endsWith(":batch"));
  const toggled = slug.startsWith("~") ? slug.slice(1) : `~${slug}`;
  if (pool.includes(toggled)) return [toggled];

  const s = slug.toLowerCase();
  const vendor = vendorKey(s);
  const max = Math.max(2, Math.floor(s.length * 0.25));
  return pool
    .map((id) => {
      const low = id.toLowerCase();
      // "claude-sonnet-46" is one edit from "claude-sonnet-4.6" (the dot
      // dropped) and one from "claude-sonnet-4". Stripped of separators, only
      // the first is an exact match — which is almost always what was meant.
      return { id, p: editDistance(bare(s), bare(low)), d: editDistance(s, low), same: vendorKey(low) === vendor };
    })
    .filter((c) => c.p <= max)
    .sort((a, b) => Number(b.same) - Number(a.same) || a.p - b.p || a.d - b.d || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((c) => c.id);
}

/** Without the separators people drop or swap: 4.6 → 46, gpt-5 → gpt5. */
function bare(slug: string): string {
  return slug.replace(/[._-]/g, "");
}

function vendorKey(slug: string): string {
  return slug.replace(/^~/, "").split("/")[0];
}

/** Levenshtein — a few hundred short ids, so the plain two-row DP is plenty. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
