import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { detectLatestVersion, detectLocaleVersion } from "@/lib/google/drive-versions";
import { gate } from "@eg/auth/session";

/**
 * POST /api/resync-versions?line=Cloud%20VPN%20Firewall
 *
 * Scans Google Drive for the latest PDF version of every product in the
 * given product line and updates `products.current_version` /
 * `products.current_versions` to match Drive — English AND every locale
 * the product has been translated into.
 *
 * Why this exists: daily sync only pulls Sheet content + images, never
 * probes Drive for version changes. If a PM manually drops a new PDF in
 * Drive (or `/api/generate-pdf` partially succeeded), the DB shows stale
 * version numbers on the Dashboard. This endpoint lets MKT bring the DB
 * back in line on demand.
 *
 * Only locales the product actually has a translation row for are
 * scanned. Probing every supported locale for every product would triple
 * the Drive calls to look for folders that mostly don't exist, and this
 * route has a 60s ceiling. Locales are scanned concurrently per product
 * so wall time stays close to the English-only version.
 */
export const maxDuration = 60;

interface ProductRow {
  id: string;
  model_name: string;
  current_version: string | null;
  current_versions: Record<string, string> | null;
}

interface ProductLineRow {
  id: string;
  name: string;
  ds_prefix: string | null;
  drive_folder_id: string | null;
}

export async function POST(request: Request) {
  const denied = await gate("sync.run");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const lineName = searchParams.get("line");
  if (!lineName) {
    return NextResponse.json({ error: "Missing ?line=" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: line, error: lineErr } = (await supabase
    .from("product_lines")
    .select("id, name, ds_prefix, drive_folder_id")
    .eq("name", lineName)
    .maybeSingle()) as { data: ProductLineRow | null; error: unknown };

  if (lineErr) {
    return NextResponse.json(
      { error: "DB error", details: String(lineErr) },
      { status: 500 },
    );
  }
  if (!line) {
    return NextResponse.json(
      { error: `Product line "${lineName}" not found` },
      { status: 404 },
    );
  }
  if (!line.drive_folder_id) {
    return NextResponse.json(
      { error: `Product line "${lineName}" has no Drive folder configured` },
      { status: 400 },
    );
  }

  const dsPrefix = line.ds_prefix ?? "DS_Cloud";

  const { data: products, error: productsErr } = (await supabase
    .from("products")
    .select("id, model_name, current_version, current_versions")
    .eq("product_line_id", line.id)
    .order("model_name")) as { data: ProductRow[] | null; error: unknown };

  if (productsErr) {
    return NextResponse.json(
      { error: "DB error", details: String(productsErr) },
      { status: 500 },
    );
  }

  const all = products ?? [];

  // Which locales each product has been translated into. A product with no
  // translations is scanned for English only, exactly as before.
  const { data: translationRows } = (await supabase
    .from("product_translations")
    .select("product_id, locale")
    .in(
      "product_id",
      all.map((p) => p.model_name),
    )) as { data: { product_id: string; locale: string }[] | null };

  const localesByModel = new Map<string, string[]>();
  for (const t of translationRows ?? []) {
    const list = localesByModel.get(t.product_id) ?? [];
    list.push(t.locale);
    localesByModel.set(t.product_id, list);
  }

  const changes: Array<{ model: string; locale: string; from: string; to: string }> = [];
  const unchanged: string[] = [];
  const notFound: string[] = [];
  const errors: Array<{ model: string; error: string }> = [];

  for (const p of all) {
    try {
      const locales = localesByModel.get(p.model_name) ?? [];

      const [enDetected, ...localeDetected] = await Promise.all([
        detectLatestVersion(line.drive_folder_id, dsPrefix, p.model_name),
        ...locales.map((loc) =>
          detectLocaleVersion(line.drive_folder_id!, dsPrefix, p.model_name, loc)
            // One locale's folder being absent or unreadable must not lose
            // the English result for the same product.
            .catch(() => null),
        ),
      ]);

      const found: Record<string, string> = {};
      if (enDetected) found.en = enDetected.version;
      locales.forEach((loc, i) => {
        const d = localeDetected[i];
        if (d) found[loc] = d.version;
      });

      if (Object.keys(found).length === 0) {
        notFound.push(p.model_name);
        continue;
      }

      const merged = { ...(p.current_versions ?? {}) };
      const productChanges: typeof changes = [];
      for (const [loc, driveVer] of Object.entries(found)) {
        const dbVer =
          merged[loc] || (loc === "en" ? p.current_version || "0.0" : "0.0");
        if (driveVer === dbVer) continue;
        merged[loc] = driveVer;
        productChanges.push({ model: p.model_name, locale: loc, from: dbVer, to: driveVer });
      }

      if (productChanges.length === 0) {
        unchanged.push(p.model_name);
        continue;
      }

      const { error: updErr } = await supabase
        .from("products")
        .update({
          // current_version is the legacy English-only field; keep it in
          // step so anything still reading it doesn't go stale.
          ...(found.en ? { current_version: found.en } : {}),
          current_versions: merged,
        })
        .eq("id", p.id);
      if (updErr) {
        errors.push({ model: p.model_name, error: String(updErr) });
        continue;
      }
      changes.push(...productChanges);
    } catch (err) {
      errors.push({
        model: p.model_name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    line: line.name,
    scanned: all.length,
    locales_scanned: [...new Set([...localesByModel.values()].flat())].sort(),
    changes,
    unchanged_count: unchanged.length,
    not_found_in_drive: notFound,
    errors,
  });
}
