import type { SupabaseClient } from "@supabase/supabase-js";
import { throwIfDbError } from "@eg/db/errors";
import type { BaselineTargets } from "./baseline";
import { parseVersion } from "./parse";
import { LOCALE_LANGUAGE, MARK_LOCALES, type Mark, type MarkDecision, type MarkLocale } from "./reminders";

/**
 * Reading and writing 可上架 / 不上架 marks (table website_marks, migration
 * 00062). Service role only: the table has RLS on and no policies.
 */

export interface MarkRow {
  product_id: string;
  locale: string;
  decision: string;
  version: string;
  generated_at: string | null;
  marked_by: string | null;
  marked_at: string;
}

export const toMark = (row: MarkRow): Mark => ({
  locale: row.locale as MarkLocale,
  decision: row.decision as MarkDecision,
  version: row.version,
  generatedAt: row.generated_at,
  markedAt: row.marked_at,
  markedBy: row.marked_by,
});

export const isMarkLocale = (value: unknown): value is MarkLocale => typeof value === "string" && (MARK_LOCALES as string[]).includes(value);

export async function loadMarks(supabase: SupabaseClient, productIds?: string[]): Promise<MarkRow[]> {
  let query = supabase.from("website_marks").select("product_id, locale, decision, version, generated_at, marked_by, marked_at");
  if (productIds) {
    if (!productIds.length) return [];
    query = query.in("product_id", productIds);
  }
  const { data, error } = (await query) as { data: MarkRow[] | null; error: { message: string } | null };
  if (error) throw new Error(`website_marks read failed: ${error.message}`);
  return data ?? [];
}

/** The versions to judge a product against: its 可上架 marks. Other languages use SpecHub's latest. */
export function targetsFromMarks(rows: MarkRow[], productId: string): BaselineTargets | undefined {
  const mine = rows.filter((r) => r.product_id === productId && r.decision === "ready" && isMarkLocale(r.locale));
  if (!mine.length) return undefined;
  return Object.fromEntries(mine.map((r) => [LOCALE_LANGUAGE[r.locale as MarkLocale], r.version]));
}

export type MarkChange = { productId: string; locale: MarkLocale; decision: MarkDecision | "clear" };

export class MarkError extends Error {}

/**
 * Apply marks. A mark is always for the language's latest version as it is
 * now — the one the page shows next to the button — and remembers that PDF's
 * generation time, so a later Regenerate shows up. Only versions SpecHub
 * generated can be marked: a number detected from Drive has no PDF here.
 */
export async function applyMarks(supabase: SupabaseClient, userId: string | null, changes: MarkChange[]): Promise<void> {
  if (!changes.length) return;
  const productIds = [...new Set(changes.map((c) => c.productId))];
  const [{ data: products, error: productError }, { data: versions, error: versionError }] = await Promise.all([
    supabase.from("products").select("id, model_name, current_versions").in("id", productIds) as unknown as Promise<{
      data: { id: string; model_name: string; current_versions: Record<string, string> | null }[] | null;
      error: { message: string } | null;
    }>,
    supabase.from("versions").select("product_id, locale, version, generated_at").in("product_id", productIds) as unknown as Promise<{
      data: { product_id: string; locale: string | null; version: string; generated_at: string }[] | null;
      error: { message: string } | null;
    }>,
  ]);
  if (productError || versionError) throw new Error(`mark lookup failed: ${(productError ?? versionError)!.message}`);

  const upserts: Omit<MarkRow, "marked_at">[] = [];
  const clears: MarkChange[] = [];
  for (const change of changes) {
    if (change.decision === "clear") {
      clears.push(change);
      continue;
    }
    const product = products?.find((p) => p.id === change.productId);
    if (!product) throw new MarkError("找不到這個產品");
    const version = product.current_versions?.[change.locale];
    const target = parseVersion(version);
    const row = (versions ?? []).find(
      (v) => v.product_id === product.id && (v.locale ?? "en") === change.locale && String(parseVersion(v.version)) === String(target),
    );
    if (!version || !row) throw new MarkError(`${product.model_name} 的 ${change.locale} 版本不是 SpecHub 產生的，沒有 PDF 可以上架`);
    upserts.push({ product_id: product.id, locale: change.locale, decision: change.decision, version, generated_at: row.generated_at, marked_by: userId });
  }

  if (upserts.length) {
    throwIfDbError("website_marks upsert")(
      await supabase.from("website_marks").upsert(
        upserts.map((u) => ({ ...u, marked_at: new Date().toISOString() })),
        { onConflict: "product_id,locale" },
      ),
    );
  }
  for (const clear of clears) {
    throwIfDbError("website_marks delete")(
      await supabase.from("website_marks").delete().eq("product_id", clear.productId).eq("locale", clear.locale),
    );
  }
}
