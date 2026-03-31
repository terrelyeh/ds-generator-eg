import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductDetail } from "@/components/product/product-detail";
import type {
  ProductWithSpecs,
  Product,
  ProductLine,
  SpecSection,
  SpecItem,
  HardwareLabel,
  ImageAsset,
  Version,
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

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <ProductDetail
        product={productWithSpecs}
        versions={versionData ?? []}
      />
    </div>
  );
}
