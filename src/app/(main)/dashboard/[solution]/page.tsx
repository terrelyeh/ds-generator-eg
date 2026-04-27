import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { checkProductLayout } from "@/lib/datasheet/layout-check";
import { filterRenderableSections } from "@/lib/datasheet/pagination";
import {
  computeContentHash,
  isAckValid,
  type LayoutAckMap,
  type LayoutAckValue,
} from "@/lib/datasheet/layout-ack";
import type { ProductLine } from "@/types/database";

interface ProductRow {
  id: string;
  model_name: string;
  subtitle: string;
  full_name: string;
  current_version: string;
  status: string;
  overview: string;
  features: string[];
  product_image: string;
  hardware_image: string;
  updated_at: string;
  product_line_id: string;
  product_lines: { name: string; label: string; category: string };
  /** Per-locale manual overrides: { en?: boolean, ja?: boolean, "zh-TW"?: boolean }.
   *  When true for a locale, the dashboard treats that locale as OK
   *  even if the heuristic would flag overflow. Set via the "Mark as
   *  Reviewed OK" button on the product detail page. */
  layout_ack: Record<string, LayoutAckValue | undefined> | null;
}

interface RadioPatternAsset {
  product_id: string;
  label: string;
  status: string;
}

interface ChangeLogRow {
  product_id: string;
  edited_at: string | null;
  edited_by: string | null;
  changes_summary: string;
}

/** Return a shallow-copied LayoutReport with every status forced to "ok".
 *  Used when the PM has manually acknowledged this locale's overflow —
 *  heuristics were flagging it red but the PM says the rendered PDF is
 *  visually acceptable. */
function forceOk<T extends {
  status: "ok" | "warn" | "overflow";
  cover: { status: "ok" | "warn" | "overflow"; overview_status: "ok" | "warn" | "overflow"; features_status: "ok" | "warn" | "overflow"; reasons: string[] };
  spec: { status: "ok" | "warn" | "overflow"; reasons: string[] };
}>(report: T): T {
  return {
    ...report,
    status: "ok",
    cover: { ...report.cover, status: "ok", overview_status: "ok", features_status: "ok", reasons: [] },
    spec: { ...report.spec, status: "ok", reasons: [] },
  };
}

export default async function SolutionDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ solution: string }>;
  searchParams: Promise<{ line?: string }>;
}) {
  const { solution: solutionSlug } = await params;
  const { line: lineSlug } = await searchParams;
  const supabase = createAdminClient();
  const user = await getCurrentUser();
  const role = user?.role ?? "viewer";

  // Verify solution exists
  const { data: solutionRows } = await supabase
    .from("solutions")
    .select("id, name, label, slug, color_primary")
    .eq("slug", solutionSlug)
    .limit(1);

  const solution = solutionRows?.[0] as { id: string; name: string; label: string; slug: string; color_primary: string } | undefined;
  if (!solution) notFound();

  // Fetch product lines for this solution only
  const { data: productLines } = (await supabase
    .from("product_lines")
    .select("*")
    .eq("solution_id", solution.id)
    .order("sort_order")) as { data: ProductLine[] | null };

  const productLineIds = (productLines ?? []).map((pl) => pl.id);

  // Fetch products for these product lines
  const { data: products } = productLineIds.length
    ? ((await supabase
        .from("products")
        .select(
          `
        id,
        model_name,
        subtitle,
        full_name,
        current_version,
        status,
        overview,
        features,
        product_image,
        hardware_image,
        updated_at,
        product_line_id,
        layout_ack,
        product_lines (name, label, category)
`
        )
        .in("product_line_id", productLineIds)
        .order("model_name")) as { data: ProductRow[] | null })
    : { data: [] as ProductRow[] };

  // Fetch radio pattern assets (for AP)
  const productIds = (products ?? []).map((p) => p.id);
  const { data: radioAssets } = productIds.length
    ? ((await supabase
        .from("image_assets")
        .select("product_id, label, status")
        .eq("image_type", "radio_pattern")
        .in("product_id", productIds)) as { data: RadioPatternAsset[] | null })
    : { data: [] as RadioPatternAsset[] };

  // Fetch latest change_log per product (for "Last Changed" column)
  const { data: changeLogs } = productIds.length
    ? ((await supabase
        .from("change_logs")
        .select("product_id, edited_at, edited_by, changes_summary")
        .not("product_id", "is", null)
        .in("product_id", productIds)
        .order("created_at", { ascending: false })) as {
        data: ChangeLogRow[] | null;
      })
    : { data: [] as ChangeLogRow[] };

  // Fetch spec_sections + their items per product. Used both for SP
  // readiness and for layout-overflow pre-checking.
  const { data: specSectionRows } = productIds.length
    ? ((await supabase
        .from("spec_sections")
        .select("id, product_id, category, sort_order, spec_items (label, value, sort_order)")
        .in("product_id", productIds)) as {
        data:
          | {
              id: string;
              product_id: string;
              category: string;
              sort_order: number;
              spec_items: { label: string; value: string; sort_order: number }[];
            }[]
          | null;
      })
    : { data: [] };

  // Build map: product_id → sorted spec sections (for layout estimation)
  const specMap = new Map<
    string,
    { sort_order: number; category: string; items: { label: string; value: string }[] }[]
  >();
  for (const sec of specSectionRows ?? []) {
    if (!specMap.has(sec.product_id)) specMap.set(sec.product_id, []);
    specMap.get(sec.product_id)!.push({
      sort_order: sec.sort_order,
      category: sec.category,
      items: (sec.spec_items ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((it) => ({ label: it.label, value: it.value })),
    });
  }
  // Drop N/A / blank rows so the layout overflow estimate isn't
  // inflated by rows the PDF will actually hide. Done after build so
  // sort_order-aware initial construction stays simple.
  for (const [pid, sections] of specMap.entries()) {
    sections.sort((a, b) => a.sort_order - b.sort_order);
    specMap.set(pid, filterRenderableSections(sections));
  }

  // Build specCount fallback for readiness
  const specCountMap = new Map<string, number>();
  for (const [pid, sections] of specMap.entries()) {
    specCountMap.set(pid, sections.length);
  }

  // Fetch translation locales per product (model_name based).
  // Also pulls overview + features per locale so the layout red/green
  // check can run against CJK content, not just English.
  const productModelNames = (products ?? []).map((p) => p.model_name);
  const { data: translationRows } = productModelNames.length
    ? ((await supabase
        .from("product_translations" as "products")
        .select("product_id, locale, overview, features")
        .in("product_id", productModelNames)) as {
        data:
          | { product_id: string; locale: string; overview: string | null; features: string[] | null }[]
          | null;
      })
    : {
        data: [] as {
          product_id: string;
          locale: string;
          overview: string | null;
          features: string[] | null;
        }[],
      };

  // Build map: model_name → locales[]
  const translationLocalesMap = new Map<string, string[]>();
  // Build map: (model_name, locale) → { overview, features } for layout checking
  const translationContentMap = new Map<
    string,
    { overview: string | null; features: string[] | null }
  >();
  for (const t of translationRows ?? []) {
    const existing = translationLocalesMap.get(t.product_id) ?? [];
    existing.push(t.locale);
    translationLocalesMap.set(t.product_id, existing);
    translationContentMap.set(`${t.product_id}|${t.locale}`, {
      overview: t.overview,
      features: t.features,
    });
  }

  // Build map: product_id → latest change_log
  const latestChangeMap = new Map<
    string,
    { edited_at: string | null; edited_by: string | null; summary: string }
  >();
  for (const cl of changeLogs ?? []) {
    if (!cl.product_id || latestChangeMap.has(cl.product_id)) continue;
    latestChangeMap.set(cl.product_id, {
      edited_at: cl.edited_at,
      edited_by: cl.edited_by,
      summary: cl.changes_summary,
    });
  }

  // Build radio pattern readiness map
  const radioMap = new Map<
    string,
    Map<string, { h_plane: boolean; e_plane: boolean }>
  >();
  if (radioAssets) {
    for (const asset of radioAssets) {
      if (!radioMap.has(asset.product_id))
        radioMap.set(asset.product_id, new Map());
      const bands = radioMap.get(asset.product_id)!;
      const bandMatch = asset.label.match(/^([\d.]+G)\s+(H|E)-plane$/i);
      if (bandMatch) {
        const band = bandMatch[1];
        const plane = bandMatch[2].toLowerCase();
        if (!bands.has(band))
          bands.set(band, { h_plane: false, e_plane: false });
        const entry = bands.get(band)!;
        if (plane === "h") entry.h_plane = asset.status !== "missing";
        if (plane === "e") entry.e_plane = asset.status !== "missing";
      }
    }
  }

  const productSummaries = (products ?? []).map((p) => {
    const hasProductImage =
      !!p.product_image && !p.product_image.startsWith("cache/");
    const hasHardwareImage =
      !!p.hardware_image && !p.hardware_image.startsWith("cache/");

    // Layout overflow pre-check (uses conservative heuristics — see
    // lib/datasheet/layout-check.ts). Surfaces as a colored badge so the
    // user can spot content-too-long issues before generating the PDF.
    //
    // Multi-locale: check English + every enabled translation locale.
    // Cover constraints differ per-locale (CJK fonts are larger and
    // line-height is taller), so a model that fits in English might
    // overflow in Japanese or Chinese. Aggregate: any locale overflow
    // → red flag; reasons are prefixed with the locale tag.
    // Per-locale manual override map. When ack is valid (content
    // hash matches what was acked), dashboard treats that locale as
    // OK. If content has changed since ack, the hash mismatches and
    // the ack silently falls back to "not acked" → warning re-appears.
    const ack = (p.layout_ack ?? {}) as LayoutAckMap;

    const englishLayoutRaw = checkProductLayout({
      overview: p.overview,
      features: p.features as string[] | null,
      spec_sections: specMap.get(p.id) ?? [],
    });
    const enHash = computeContentHash(p.overview, p.features as string[] | null);
    const englishLayout = isAckValid(ack.en, enHash)
      ? forceOk(englishLayoutRaw)
      : englishLayoutRaw;

    const enabledLocales = translationLocalesMap.get(p.model_name) ?? [];
    const localizedReports = enabledLocales
      .map((locale) => {
        const content = translationContentMap.get(`${p.model_name}|${locale}`);
        // Skip locales that have no translated content yet — measuring
        // English text with CJK metrics would falsely red-flag. The
        // warning is only meaningful once there's something localized
        // that will actually render in CJK typography.
        const hasAnyTranslation =
          (content?.overview && content.overview.trim().length > 0) ||
          (content?.features && content.features.length > 0);
        if (!hasAnyTranslation) return null;
        const overview = content?.overview ?? p.overview;
        const features = (content?.features ?? p.features) as string[] | null;
        const raw = checkProductLayout({
          overview,
          features,
          spec_sections: specMap.get(p.id) ?? [],
          locale,
        });
        const localeHash = computeContentHash(overview, features);
        return {
          locale,
          report: isAckValid(ack[locale], localeHash) ? forceOk(raw) : raw,
        };
      })
      .filter((r): r is { locale: string; report: ReturnType<typeof checkProductLayout> } => r !== null);

    // Aggregate per-field: worst status across EN + all locales.
    // Tag each non-ok reason with its locale so the UI can tell the user
    // which language is overflowing.
    const statusRank = { ok: 0, warn: 1, overflow: 2 } as const;
    const worstField = (
      fieldOf: (r: typeof englishLayout) => { status: "ok" | "warn" | "overflow" },
    ) => {
      let worst: "ok" | "warn" | "overflow" = fieldOf(englishLayout).status;
      for (const { report } of localizedReports) {
        const s = fieldOf(report).status;
        if (statusRank[s] > statusRank[worst]) worst = s;
      }
      return worst;
    };

    const aggregatedReasons: string[] = [];
    if (englishLayout.cover.reasons.length || englishLayout.spec.reasons.length) {
      for (const r of [...englishLayout.cover.reasons, ...englishLayout.spec.reasons]) {
        aggregatedReasons.push(`[EN] ${r}`);
      }
    }
    for (const { locale, report } of localizedReports) {
      for (const r of [...report.cover.reasons, ...report.spec.reasons]) {
        aggregatedReasons.push(`[${locale.toUpperCase()}] ${r}`);
      }
    }

    const layout = {
      cover: {
        overview_status: worstField((r) => r.cover.overview_status === undefined ? { status: "ok" as const } : { status: r.cover.overview_status }),
        features_status: worstField((r) => ({ status: r.cover.features_status ?? "ok" })),
        reasons: aggregatedReasons.filter((x) => x.includes("Overview") || x.includes("Feature")),
      },
      spec: {
        status: worstField((r) => ({ status: r.spec.status })),
        reasons: aggregatedReasons.filter((x) => x.includes("Spec") || x.includes("spec")),
      },
    };

    const radioPatterns: {
      band: string;
      h_plane: boolean;
      e_plane: boolean;
    }[] = [];
    const bands = radioMap.get(p.id);
    if (bands) {
      const order = ["2.4G", "5G", "6G"];
      for (const band of order) {
        if (bands.has(band)) radioPatterns.push({ band, ...bands.get(band)! });
      }
    }

    const latestChange = latestChangeMap.get(p.id);

    return {
      id: p.id,
      model_name: p.model_name,
      subtitle: p.subtitle,
      full_name: p.full_name,
      current_version: p.current_version,
      status: p.status || "active",
      has_overview: !!p.overview && p.overview.trim().length > 0,
      has_features: Array.isArray(p.features) && p.features.length > 0,
      has_specs: (specCountMap.get(p.id) || 0) > 0,
      has_product_image: hasProductImage,
      has_hardware_image: hasHardwareImage,
      radio_patterns: radioPatterns,
      last_content_changed: latestChange?.edited_at ?? null,
      last_change_by: latestChange?.edited_by ?? null,
      last_change_summary: latestChange?.summary ?? null,
      updated_at: p.updated_at,
      product_line_id: p.product_line_id,
      product_line: p.product_lines,
      translation_locales: translationLocalesMap.get(p.model_name) ?? [],
      // Per-section layout status so the OV / FT / SP columns can reflect
      // not just presence but whether the content will fit the PDF.
      overview_layout_status: layout.cover.overview_status,
      features_layout_status: layout.cover.features_status,
      spec_layout_status: layout.spec.status,
      layout_reasons: [...layout.cover.reasons, ...layout.spec.reasons],
    };
  });

  // Resolve ?line= slug to product line ID
  const initialLineId = lineSlug
    ? (productLines ?? []).find(
        (pl) => pl.name.toLowerCase().replace(/\s+/g, "-") === lineSlug
      )?.id
    : undefined;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <DashboardContent
        productLines={productLines ?? []}
        products={productSummaries}
        initialLineId={initialLineId}
        role={role}
      />
    </div>
  );
}
