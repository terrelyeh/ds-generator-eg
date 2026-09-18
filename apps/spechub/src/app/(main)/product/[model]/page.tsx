import { notFound } from "next/navigation";
import { createClient } from "@eg/db/server";
import { createAdminClient } from "@eg/db/admin";
import { can } from "@eg/auth/permissions";
import { getCurrentUser, localesWithDesignatedReviewer } from "@eg/auth/session";
import { ProductDetail } from "@/components/product/product-detail";
import type { SiteVerdict } from "@/lib/website/compare";
import { loadMarks, toMark } from "@/lib/website/marks";
import { countTodo, LOCALE_LANGUAGE } from "@/lib/website/reminders";
import { checkProductLayout } from "@/lib/datasheet/layout-check";
import { filterRenderableSections } from "@/lib/datasheet/pagination";
import {
  computeContentHash,
  isAckValid,
  type LayoutAckMap,
} from "@/lib/datasheet/layout-ack";
import type {
  ProductWithSpecs,
  Product,
  ProductLine,
  SpecSection,
  SpecItem,
  HardwareLabel,
  ImageAsset,
  Version,
  ProductTranslation,
} from "@eg/db/types";

interface ProductQueryRow extends Product {
  product_lines: ProductLine;
  spec_sections: (SpecSection & { spec_items: SpecItem[] })[];
  hardware_labels: HardwareLabel[];
  image_assets: ImageAsset[];
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ model: string }>;
}) {
  const { model } = await params;
  const supabase = await createClient();

  // These three are independent — run in parallel instead of waterfalling.
  // getCurrentUser uses its own client; the product fetch keys on
  // model_name; product_translations.product_id is the model_name string
  // (not products.id), so it doesn't need the product row first.
  const [user, { data }, { data: translationData }] = await Promise.all([
    getCurrentUser(),
    supabase
      .from("products")
      .select(
        `
      *,
      product_lines (*),
      spec_sections (*, spec_items (*)),
      hardware_labels (*),
      image_assets (*)
    `
      )
      .eq("model_name", model)
      .single(),
    supabase
      .from("product_translations")
      .select("*")
      .eq("product_id", model) as unknown as Promise<{ data: ProductTranslation[] | null }>,
  ]);
  const role = user?.role ?? "viewer";
  // Which locales route through a reviewer. The editor needs this before
  // the first save so its button can say what it will actually do.
  const reviewedLocales = await localesWithDesignatedReviewer();

  const product = data as ProductQueryRow | null;

  if (!product) {
    notFound();
  }

  // Solution slug for the breadcrumb back-link. product_lines carries
  // solution_id, but the /dashboard/[solution] route is keyed by slug.
  const { data: solRow } = (await supabase
    .from("solutions")
    .select("slug")
    .eq("id", product.product_lines.solution_id)
    .single()) as { data: { slug: string } | null };
  const solutionSlug = solRow?.slug ?? "cloud";

  const productWithSpecs: ProductWithSpecs = {
    ...product,
    product_line: product.product_lines,
    // Filter N/A / blank rows so the detail page and the PDF preview
    // both hide them (keeps DB data intact — filter is render-only).
    spec_sections: filterRenderableSections(
      (product.spec_sections ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((section) => ({
          ...section,
          items: (section.spec_items ?? []).sort(
            (a, b) => a.sort_order - b.sort_order
          ),
        })),
    ),
    hardware_labels: (product.hardware_labels ?? []).sort(
      (a, b) => a.sort_order - b.sort_order
    ),
    image_assets: product.image_assets ?? [],
  };

  // versions needs product.id (only known after the product fetch above),
  // so it stays as a second round trip. translationData was already
  // fetched in parallel above.
  // The 官網 tab's number: sites that need something for this model's
  // 可上架 versions, read from the last saved checks. website_checks and
  // website_marks have RLS with no policies, so they are read with the
  // service role — and only for roles that can see the tab.
  const canSeeWebsite = can(role, "website_check.view");
  const [{ data: versionData }, websiteRows, websiteMarks] = await Promise.all([
    supabase
      .from("versions")
      .select("*")
      .eq("product_id", product.id)
      .order("generated_at", { ascending: false }) as unknown as Promise<{ data: Version[] | null }>,
    canSeeWebsite
      ? (createAdminClient()
          .from("website_checks")
          .select("site, checked_at, verdict")
          .eq("model_name", product.model_name.toUpperCase()) as unknown as Promise<{
          data: { site: string; checked_at: string; verdict: SiteVerdict }[] | null;
        }>)
      : Promise.resolve({ data: null }),
    canSeeWebsite ? loadMarks(createAdminClient(), [product.id]).catch(() => []) : Promise.resolve([]),
  ]);
  const websiteTodoCount = canSeeWebsite
    ? countTodo({
        model: product.model_name,
        marks: websiteMarks.map(toMark),
        available: new Set(
          (["en", "ja", "zh-TW"] as const)
            .filter((locale) => (product.current_versions as Record<string, string> | null)?.[locale])
            .map((locale) => LOCALE_LANGUAGE[locale]),
        ),
        checks: Object.fromEntries((websiteRows.data ?? []).map((row) => [row.site, { verdict: row.verdict, checkedAt: row.checked_at }])),
      })
    : null;

  // Pre-compute layout overflow estimate for English + every enabled
  // translation locale. Each locale uses its own typography metrics
  // (CJK fonts are bigger with taller line-height), so a model that
  // fits in English may overflow in Japanese / Chinese.
  const specSectionsForCheck = productWithSpecs.spec_sections.map((s) => ({
    category: s.category,
    items: s.items.map((it) => ({ label: it.label, value: it.value })),
  }));

  const layoutReportRaw = checkProductLayout({
    overview: productWithSpecs.overview,
    features: productWithSpecs.features as string[] | null,
    spec_sections: specSectionsForCheck,
    lineCategory: product.product_lines?.category,
  });

  // Respect per-locale manual acknowledgements, but only while the
  // content hash matches what was acked. If overview/features have
  // been edited since, the ack silently invalidates and the warning
  // re-appears. Stored in products.layout_ack JSONB.
  const ack = (product.layout_ack ?? {}) as LayoutAckMap;
  const enHash = computeContentHash(
    productWithSpecs.overview,
    productWithSpecs.features as string[] | null,
  );
  const enAckValid = isAckValid(ack.en, enHash);
  const layoutReport = enAckValid ? null : layoutReportRaw;

  // Per-locale reports keyed by locale. Skip any locale the PM has
  // already acknowledged (and the ack is still valid) — banner
  // disappears until they un-ack or the content changes significantly.
  // For each locale we also surface acked=true/false so the child
  // component can render an Undo affordance.
  const localizedReports: {
    locale: string;
    report: typeof layoutReportRaw;
    acked: boolean;
  }[] = [];
  for (const t of translationData ?? []) {
    // Skip if nothing has been translated yet. Measuring English text
    // with CJK metrics would falsely red-flag the locale before the
    // PM has done any work.
    const hasAnyTranslation =
      (t.overview && t.overview.trim().length > 0) ||
      (t.features && t.features.length > 0);
    if (!hasAnyTranslation) continue;

    const overview = t.overview ?? productWithSpecs.overview;
    const features = (t.features ?? productWithSpecs.features) as string[] | null;
    const localeHash = computeContentHash(overview, features);
    const localeAckValid = isAckValid(ack[t.locale], localeHash);
    const report = checkProductLayout({
      overview,
      features,
      spec_sections: specSectionsForCheck,
      locale: t.locale,
      lineCategory: product.product_lines?.category,
    });
    localizedReports.push({
      locale: t.locale,
      report,
      acked: localeAckValid,
    });
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <ProductDetail
        product={productWithSpecs}
        solutionSlug={solutionSlug}
        versions={versionData ?? []}
        translations={translationData ?? []}
        layoutReport={layoutReport ?? undefined}
        localizedLayoutReports={localizedReports}
        englishAcked={enAckValid && layoutReportRaw.status !== "ok"}
        role={role}
        reviewLocales={user?.reviewLocales ?? null}
        reviewedLocales={reviewedLocales}
        websiteTodoCount={websiteTodoCount}
      />
    </div>
  );
}
