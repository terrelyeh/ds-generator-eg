import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductDetail } from "@/components/product/product-detail";
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
} from "@/types/database";

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

  const { data } = await supabase
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
    .single();

  const product = data as ProductQueryRow | null;

  if (!product) {
    notFound();
  }

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

  const { data: versionData } = await supabase
    .from("versions")
    .select("*")
    .eq("product_id", product.id)
    .order("generated_at", { ascending: false }) as { data: Version[] | null };

  // Fetch existing translations for this product
  const { data: translationData } = (await supabase
    .from("product_translations")
    .select("*")
    .eq("product_id", model)) as { data: ProductTranslation[] | null };

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
        versions={versionData ?? []}
        translations={translationData ?? []}
        layoutReport={layoutReport ?? undefined}
        localizedLayoutReports={localizedReports}
        englishAcked={enAckValid && layoutReportRaw.status !== "ok"}
      />
    </div>
  );
}
