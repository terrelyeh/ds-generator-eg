import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { getCurrentUser } from "@eg/auth/session";
import { can } from "@eg/auth/permissions";

/**
 * Work queue for the review workflow — two sides of the same table.
 *
 * The Japanese translations sat as drafts for months partly because
 * nothing ever said they were waiting. A reviewer should not have to be
 * handed a product URL to discover there is work.
 *
 * Reviewers see `draft` rows in the locales they are scoped to; MKT sees
 * `changes_requested` rows, which are theirs to fix. Both sides come from
 * one query and get filtered per role, so the two views can't drift.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "product.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isReviewer = can(user.role, "review.approve");
  const isEditor = can(user.role, "translation.edit");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("product_translations")
    .select("product_id, locale, review_status, reviewed_at, translated_at")
    .in("review_status", ["draft", "changes_requested"])
    .order("translated_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    product_id: string;
    locale: string;
    review_status: string;
    reviewed_at: string | null;
    translated_at: string | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const inScope = (locale: string) =>
    user.reviewLocales === null || user.reviewLocales.includes(locale);

  // Waiting on a reviewer — only the locales this person may actually act
  // on, so the queue is a to-do list rather than a status board.
  const toReview = isReviewer
    ? rows.filter((r) => r.review_status === "draft" && inScope(r.locale))
    : [];

  // Sent back to MKT. Not locale-filtered: whoever edits fixes all of them.
  const toFix = isEditor ? rows.filter((r) => r.review_status === "changes_requested") : [];

  // Latest comment for each sent-back row, so the list says what to change
  // instead of only that something is wrong.
  const latestComments: Record<string, string> = {};
  if (toFix.length) {
    const { data: reviews } = await supabase
      .from("translation_reviews" as "products")
      .select("product_id, locale, comment, created_at")
      .in("product_id", [...new Set(toFix.map((r) => r.product_id))])
      .order("created_at", { ascending: false });

    for (const rv of (reviews ?? []) as unknown as {
      product_id: string;
      locale: string;
      comment: string | null;
    }[]) {
      const k = `${rv.product_id}|${rv.locale}`;
      if (!latestComments[k] && rv.comment) latestComments[k] = rv.comment;
    }
  }

  return NextResponse.json({
    ok: true,
    reviewLocales: user.reviewLocales,
    toReview,
    toFix: toFix.map((r) => ({
      ...r,
      latest_comment: latestComments[`${r.product_id}|${r.locale}`] ?? null,
    })),
  });
}
