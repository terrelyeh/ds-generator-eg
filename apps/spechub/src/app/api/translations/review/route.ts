import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { getCurrentUser, canReviewLocale } from "@eg/auth/session";
import { can } from "@eg/auth/permissions";

/**
 * Review actions on a locale's translation — approve, send back, comment.
 *
 * Separate from /api/translations/product on purpose: that route is
 * editing (gated on translation.edit, held by MKT), this one is reviewing
 * (gated on review.approve, held by PM and the branch office). Keeping
 * them in one endpoint is what made `confirmed` writable by whoever could
 * edit, which is the thing this workflow exists to separate.
 *
 * GET  ?product=X&locale=es  → review history, newest first
 * POST { product_id, locale, action, comment?, target_field?, target_index? }
 */

const ACTIONS = ["approved", "changes_requested", "commented"] as const;
type Action = (typeof ACTIONS)[number];

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Anyone who can see the product can read the review thread — MKT needs
  // it to act on the feedback, not just the reviewer who wrote it.
  if (!can(user.role, "product.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const product = searchParams.get("product");
  const locale = searchParams.get("locale");
  if (!product || !locale) {
    return NextResponse.json({ error: "Missing product or locale" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("translation_reviews" as "products")
    .select("id, action, comment, target_field, target_index, reviewer_id, created_at")
    .eq("product_id", product)
    .eq("locale", locale)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as {
    reviewer_id: string | null;
    [k: string]: unknown;
  }[];

  // Resolve reviewer names in one query rather than per row.
  const ids = [...new Set(rows.map((r) => r.reviewer_id).filter(Boolean))] as string[];
  let names: Record<string, string> = {};
  if (ids.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", ids);
    names = Object.fromEntries(
      ((profs ?? []) as { id: string; name: string | null; email: string }[]).map((p) => [
        p.id,
        p.name || p.email,
      ]),
    );
  }

  return NextResponse.json({
    ok: true,
    reviews: rows.map((r) => ({
      ...r,
      reviewer_name: r.reviewer_id ? (names[r.reviewer_id] ?? null) : null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { product_id, locale, action, comment, target_field, target_index } = body as {
    product_id?: string;
    locale?: string;
    action?: Action;
    comment?: string | null;
    target_field?: string | null;
    target_index?: number | null;
  };

  if (!product_id || !locale || !action) {
    return NextResponse.json({ error: "Missing product_id, locale or action" }, { status: 400 });
  }
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  }

  // Locale scope is the point of the feature: the Mexico office reviews
  // es, not ja. `commented` is held to the same bar — a comment on a
  // translation you have no say over is noise for whoever has to read it.
  if (!canReviewLocale(user, locale)) {
    return NextResponse.json(
      {
        error: can(user.role, "review.approve")
          ? `你沒有審核 ${locale} 的權限（可審語言：${user.reviewLocales?.join(", ") || "無"}）`
          : "你的角色沒有審核權限",
      },
      { status: 403 },
    );
  }

  const text = (comment ?? "").trim();
  if (action !== "approved" && !text) {
    return NextResponse.json(
      { error: "退回或留言時必須填寫意見" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // The log is append-only; a new round adds a row rather than editing one.
  const { error: logErr } = await supabase.from("translation_reviews" as "products").insert({
    product_id,
    locale,
    action,
    comment: text || null,
    target_field: target_field || null,
    target_index: target_index ?? null,
    reviewer_id: user.id,
  } as never);

  if (logErr) {
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  // A bare comment is an annotation, not a verdict — it must not move the
  // row's state, or a reviewer noting one wording nit would silently
  // unblock (or block) PDF generation.
  if (action === "commented") {
    return NextResponse.json({ ok: true, review_status: null });
  }

  const review_status = action === "approved" ? "approved" : "changes_requested";
  const { error: stErr } = await supabase
    .from("product_translations" as "products")
    .update({
      review_status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("product_id", product_id)
    .eq("locale", locale);

  if (stErr) {
    return NextResponse.json({ error: stErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, review_status });
}
