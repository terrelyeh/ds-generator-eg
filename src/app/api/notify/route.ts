import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotifications } from "@/lib/notifications";
import type { ChangeEntry } from "@/lib/notifications";

/**
 * POST /api/notify
 *
 * Sends notifications for un-notified change logs, then marks them as notified.
 * Called after sync completes, or can be triggered independently.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch un-notified change logs (uses the idx_change_logs_notified index)
  const { data: logs, error: logsError } = await supabase
    .from("change_logs")
    .select(
      `
      id,
      changes_summary,
      edited_by,
      edited_at,
      products (model_name, product_line_id),
      product_lines (label)
    `
    )
    .eq("notified", false)
    .order("created_at", { ascending: true })
    .limit(100) as {
    data: {
      id: string;
      changes_summary: string;
      edited_by: string | null;
      edited_at: string | null;
      products: { model_name: string; product_line_id: string } | null;
      product_lines: { label: string } | null;
    }[] | null;
    error: { message: string } | null;
  };

  if (logsError) {
    return NextResponse.json(
      { error: "Failed to fetch change logs", details: logsError.message },
      { status: 500 }
    );
  }

  if (!logs || logs.length === 0) {
    return NextResponse.json({ ok: true, message: "No pending notifications" });
  }

  // Build change entries for the notification
  const changes: ChangeEntry[] = logs.map((log) => {
    const product = log.products;
    const productLine = log.product_lines;
    return {
      product_name: product?.model_name ?? "Unknown",
      product_line: productLine?.label ?? "Unknown",
      changes_summary: log.changes_summary,
      edited_by: log.edited_by,
      edited_at: log.edited_at,
    };
  });

  // Send notifications
  const result = await sendNotifications(changes);

  // Mark logs as notified (only if at least one channel succeeded)
  if (result.sent.length > 0) {
    const logIds = logs.map((l) => l.id);
    await supabase
      .from("change_logs")
      .update({ notified: true })
      .in("id", logIds);
  }

  return NextResponse.json({
    ok: true,
    changes_count: changes.length,
    notifications: result,
  });
}

// Allow GET for easy testing
export async function GET(request: Request) {
  return POST(request);
}
