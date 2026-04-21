import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductDetail } from "@/components/product/product-detail";
import { checkProductLayout } from "@/lib/datasheet/layout-check";
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
    spec_sections: (product.spec_sections ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((section) => ({
        ...section,
        items: (section.spec_items ?? []).sort(
          (a, b) => a.sort_order - b.sort_order
        ),
      })),
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
    .from("product_translations" as "products")
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

  // Respect per-locale manual acknowledgements. When ack[locale] is
  // true (PM clicked "Mark as Reviewed OK" after visual verification),
  // we suppress the warning banner for that locale. Stored in
  // products.layout_ack JSONB.
  const ack = (product.layout_ack as Record<string, boolean> | null) ?? {};
  const layoutReport = ack.en ? null : layoutReportRaw;

  // Per-locale reports keyed by locale. Skip any locale the PM has
  // already acknowledged — banner disappears until they un-ack or the
  // content changes significantly.
  const localizedReports: { locale: string; report: typeof layoutReportRaw }[] = [];
  for (const t of translationData ?? []) {
    if (ack[t.locale]) continue;
    localizedReports.push({
      locale: t.locale,
      report: checkProductLayout({
        overview: t.overview ?? productWithSpecs.overview,
        features: (t.features ?? productWithSpecs.features) as string[] | null,
        spec_sections: specSectionsForCheck,
        locale: t.locale,
      }),
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
      />
    </div>
  );
}
