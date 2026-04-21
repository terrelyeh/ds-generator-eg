import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { splitIntoPages } from "@/lib/datasheet/pagination";
import { estimateCoverLayout, balanceFeatureColumns, FEATURES_MAX_HEIGHT } from "@/lib/datasheet/cover-layout";
import { getDict } from "@/lib/datasheet/locales";
import { TYPOGRAPHY_DEFAULTS, FONT_OPTIONS } from "@/lib/datasheet/typography";
import type { TypographySettings } from "@/lib/datasheet/typography";
import { PrintToolbar } from "@/components/preview/print-toolbar";
import type {
  Product,
  ProductLine,
  SpecSection,
  SpecItem,
} from "@/types/database";

interface ProductQueryRow extends Product {
  product_lines: ProductLine;
  spec_sections: (SpecSection & { spec_items: SpecItem[] })[];
}

/** Non-cloud product lines use gray theme instead of blue */
const NON_CLOUD_CATEGORIES = new Set(["Unmanaged Switches", "Extenders"]);

function getTheme(category: string) {
  const isCloud = !NON_CLOUD_CATEGORIES.has(category);
  return {
    isCloud,
    primary: isCloud ? "#03a9f4" : "#58595B",
    headerBg: isCloud ? "#03a9f4" : "#58595B",
    modelColor: isCloud ? "#03a9f4" : "#231f20",
    sectionTitle: isCloud ? "#03a9f4" : "#231f20",
    specLabel: isCloud ? "#03a9f4" : "#231f20",
    featuresBox: isCloud ? "#ebf8fe" : "#f2f2f2",
    subtitleColor: isCloud ? "#03a9f4" : "#58595B",
  };
}

/**
 * Parse **bold** markdown in text → React elements with <strong>.
 * E.g. "**クラウド管理型 AI**\n256GB 搭載" → [<strong>クラウド管理型 AI</strong>, <br/>, "256GB 搭載"]
 */
function parseHeadlineMarkup(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split by newlines first
  const lines = text.split("\n");
  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) nodes.push(<br key={`br-${lineIdx}`} />);
    // Parse **bold** within each line
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    parts.forEach((part, partIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        nodes.push(
          <strong key={`${lineIdx}-${partIdx}`}>
            {part.slice(2, -2)}
          </strong>
        );
      } else if (part) {
        nodes.push(part);
      }
    });
  });
  return nodes;
}

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ model: string }>;
  searchParams: Promise<{ lang?: string; mode?: string; toolbar?: string; version?: string }>;
}) {
  const { model } = await params;
  const { lang = "en", mode = "light", toolbar, version: versionOverride } = await searchParams;
  const showToolbar = toolbar !== "false";

  const dict = getDict(lang);
  const isTranslated = lang !== "en";

  const supabase = await createClient();

  const { data } = await supabase
    .from("products")
    .select(
      `
      *,
      product_lines (*),
      spec_sections (*, spec_items (*))
    `
    )
    .eq("model_name", model)
    .single();

  const product = data as ProductQueryRow | null;
  if (!product) notFound();

  // --- Load translations if non-English ---
  let translatedOverview: string | null = null;
  let translatedFeatures: string[] | null = null;
  let translatedHeadline: string | null = null;
  let translatedSubtitle: string | null = null;
  let localeHardwareImage: string | null = null;
  let customQrLabel: string | null = null;
  let customQrUrl: string | null = null;
  let specLabelMap: Record<string, string> = {};
  let sectionLabelMap: Record<string, string> = {};

  if (isTranslated) {
    // Per-product translation (overview + features)
    const { data: pt } = await supabase
      .from("product_translations" as "products")
      .select("overview, features, translation_mode, headline, subtitle, hardware_image, qr_label, qr_url")
      .eq("product_id", model)
      .eq("locale", lang)
      .single() as { data: { overview: string | null; features: string[] | null; translation_mode: string; headline: string | null; subtitle: string | null; hardware_image: string | null; qr_label: string | null; qr_url: string | null } | null };

    if (pt) {
      translatedOverview = pt.overview;
      translatedFeatures = pt.features;
      translatedHeadline = pt.headline;
      translatedSubtitle = pt.subtitle;
      localeHardwareImage = pt.hardware_image;
      customQrLabel = pt.qr_label;
      customQrUrl = pt.qr_url;
    }

    // Per-product-line spec label translations (only if full mode)
    if (mode === "full") {
      const { data: slt } = await supabase
        .from("spec_label_translations" as "products")
        .select("original_label, translated_label, label_type")
        .eq("product_line_id", product.product_line_id)
        .eq("locale", lang) as { data: { original_label: string; translated_label: string | null; label_type: string }[] | null };

      if (slt) {
        for (const row of slt) {
          if (!row.translated_label) continue;
          if (row.label_type === "spec") {
            specLabelMap[row.original_label] = row.translated_label;
          } else {
            sectionLabelMap[row.original_label] = row.translated_label;
          }
        }
      }
    }
  }

  // --- Build spec sections (with optional label translation) ---
  const specSections = (product.spec_sections ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      category: sectionLabelMap[s.category] ?? s.category,
      items: (s.spec_items ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({
          label: specLabelMap[i.label] ?? i.label,
          value: i.value,
        })),
    }));

  const specPages = splitIntoPages(specSections);

  // --- Resolve display content ---
  const overview = (isTranslated && translatedOverview) ? translatedOverview : product.overview;
  const features = (isTranslated && translatedFeatures) ? translatedFeatures : (product.features ?? []);
  const headline = (isTranslated && translatedHeadline) ? translatedHeadline : (product.headline || product.full_name);
  const subtitle = (isTranslated && translatedSubtitle) ? translatedSubtitle : product.subtitle;
  // Height-balanced feature columns — previously split at ceil(n/2) which
  // gave visual imbalance when some items wrapped to 3+ lines while others
  // were short (ECW560 had left-col 90pt taller than right). Now each item
  // goes to whichever column is currently shorter.
  const { left: leftFeatures, right: rightFeatures } = balanceFeatureColumns(features);

  // Dynamic cover layout — mirrors the manual designer's workflow of
  // sizing features first, then flowing overview into remaining space.
  // Healthy datasheets (features ≤ 260pt content) render almost identically
  // to before; oversized content gets clipped (flagged red via layout-check).
  const coverLayout = estimateCoverLayout({ overview, features });

  // versionOverride is passed by /api/generate-pdf so the footer prints the
  // correct version being generated, rather than the stale DB value which
  // hasn't been updated yet at render time.
  const currentVersions = product.current_versions as Record<string, string> | null;
  const version = versionOverride || currentVersions?.[lang] || product.current_version || "1.0";
  const today = new Date().toLocaleDateString(dict.dateLocale, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const productLine = product.product_lines;
  const theme = getTheme(productLine.category);

  // QR: custom per-product-translation > locale default
  const qrLabel = customQrLabel || dict.defaultQrLabel;
  const qrUrlTemplate = customQrUrl || dict.defaultQrUrl;
  const qsgUrl = qrUrlTemplate.replace("{model}", product.model_name.toLowerCase());
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qsgUrl)}`;
  const totalPages = 1 + specPages.length + 1; // cover + specs + hardware

  const isCJK = lang === "ja" || lang === "zh-TW";

  // Load typography settings from DB (with defaults fallback)
  let typo: TypographySettings | null = null;
  if (isCJK) {
    const defaults = TYPOGRAPHY_DEFAULTS[lang] ?? TYPOGRAPHY_DEFAULTS["ja"];
    try {
      const { data: typoData } = await supabase
        .from("app_settings" as "products")
        .select("value")
        .eq("key", `typography_${lang}`)
        .single() as { data: { value: string } | null };

      if (typoData?.value) {
        typo = { ...defaults, ...JSON.parse(typoData.value) };
      } else {
        typo = defaults;
      }
    } catch {
      typo = defaults;
    }
  }

  // Font: from typography settings or defaults
  const chosenFont = typo?.font_family;
  const fontImportSlug = chosenFont
    ? (FONT_OPTIONS[lang] ?? []).find((f) => f.value === chosenFont)?.import
      ?? chosenFont.replace(/\s+/g, "+")
    : null;

  const fontImports = [
    "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&display=swap",
    ...(fontImportSlug
      ? [`https://fonts.googleapis.com/css2?family=${fontImportSlug}:wght@300;400;500;600;700&display=swap`]
      : []),
  ];

  const fontFamily = chosenFont
    ? `'${chosenFont}', 'Roboto', sans-serif`
    : "'Roboto', sans-serif";

  return (
    <>
      {showToolbar && (
        <PrintToolbar
          model={product.model_name}
          currentVersion={version}
          canGenerate={
            !!product.product_image && !product.product_image.startsWith("cache/") &&
            !!product.hardware_image && !product.hardware_image.startsWith("cache/") &&
            !!product.overview && product.overview.trim().length > 0 &&
            Array.isArray(product.features) && product.features.length > 0
          }
          locale={lang}
        />
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `
${fontImports.map((url) => `@import url('${url}');`).join("\n")}

@page { size: letter; margin: 0; }

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}

body {
  font-family: ${fontFamily};
  color: #6f6f6f;
  font-size: 7pt;
  line-height: 1.4;
  background: #e0e0e0;
  padding-top: ${showToolbar ? "48px" : "0"};
}

@media print {
  html, body {
    padding: 0 !important;
    margin: 0 !important;
    background: white !important;
    min-height: 0 !important;
  }
  .page {
    box-shadow: none !important;
    margin: 0 !important;
    page-break-after: always;
    page-break-inside: avoid;
  }
  .page:last-of-type {
    page-break-after: auto;
  }
  .print-toolbar { display: none !important; }
}

.page {
  width: 612pt;
  height: 792pt;
  position: relative;
  overflow: hidden;
  page-break-after: always;
  background: white;
  margin: 20px auto;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

/* Top bar */
.top-bar { background: ${theme.headerBg}; height: 21.4pt; width: 100%; }
.top-bar-full {
  background: ${theme.headerBg}; height: 94.5pt; width: 100%; position: relative;
}
.top-bar-full .logo-img {
  position: absolute; left: 36pt; top: 50%; transform: translateY(-50%); height: 27pt;
}
.top-bar-full .title-area {
  position: absolute; right: 27pt; top: 44pt;
}
.top-bar-full .title-prefix {
  font-weight: 300; font-size: 12pt; color: white;
}
.top-bar-full .title-category {
  font-weight: 500; font-size: 14pt; color: white;
}

.page-number {
  position: absolute; right: 23pt; bottom: 18pt;
  font-weight: 300; font-size: 7pt; color: #6f7073;
}

/* Cover */
.cloud-icon {
  position: absolute; left: 36pt; top: 142pt; width: 85pt; height: auto;
}
.model-name {
  position: absolute; right: 27pt; top: 104pt;
  font-weight: 500; font-size: 12pt; color: ${theme.modelColor};
}

/* Cloud cover: subtitle next to cloud icon */
.product-subtitle-cloud {
  position: absolute; left: 134pt; top: 138pt;
  font-weight: 500; font-size: 19pt; color: ${theme.subtitleColor};
}
.product-fullname-cloud {
  position: absolute; left: 134pt; top: 160pt; right: 36pt;
  font-weight: 500; font-size: 24pt; color: #231f20; line-height: 1.15;
}

/* Non-cloud cover: subtitle aligned left (no cloud icon) */
.product-subtitle-standard {
  position: absolute; left: 36pt; top: 130pt;
  font-weight: 500; font-size: 19pt; color: ${theme.subtitleColor};
}
.product-fullname-standard {
  position: absolute; left: 36pt; top: 155pt; right: 36pt;
  font-weight: 500; font-size: 24pt; color: #231f20; line-height: 1.15;
}

.product-image-container {
  position: absolute; right: 10pt;
  top: 210pt; bottom: 260pt;
  width: 310pt;
  display: flex; align-items: center; justify-content: center;
}
.product-image-container img {
  max-width: 290pt; max-height: 100%; object-fit: contain;
}

.section-title {
  font-weight: 500; font-size: 14pt; color: ${theme.sectionTitle}; margin-bottom: 8pt;
}
.overview-section {
  position: absolute; left: 36pt; top: 270pt; width: 270pt;
  /* 'bottom' is set inline from coverLayout.overviewBottom so overview
     reserves space for the features wrapper below. overflow: hidden is a
     safety net — if content over-estimates slightly, clip rather than
     overlap features. */
  overflow: hidden;
}
.overview-text {
  font-weight: 400; font-size: 11pt; color: #6f6f6f; line-height: 1.35;
}

.features-wrapper {
  position: absolute; left: 36pt; right: 36pt; bottom: 36pt;
  /* Hard cap to match the designer's implicit limit — beyond this,
     features become cramped and visually break. Content that exceeds
     this cap gets clipped and is flagged red by layout-check. */
  max-height: ${FEATURES_MAX_HEIGHT}pt;
  overflow: hidden;
}
.features-title {
  font-weight: 500; font-size: 14pt; color: ${theme.sectionTitle}; margin-bottom: 10pt;
}
.features-box { background: ${theme.featuresBox}; padding: 18pt 28pt; }
.features-columns { display: table; width: 100%; table-layout: fixed; }
.features-col { display: table-cell; width: 50%; vertical-align: top; }
.features-col:first-child { padding-right: 14pt; }
.features-col:last-child { padding-left: 14pt; }
.feature-item {
  display: flex; align-items: baseline; gap: 6pt;
  font-weight: 400; font-size: 11pt; color: #4a4a4a;
  margin-bottom: 8pt; line-height: 1.35;
}
.feature-bullet {
  flex-shrink: 0; color: #4a4a4a; font-size: 6pt; line-height: 1;
  margin-top: 4pt;
}
.feature-text { flex: 1; }

/* Spec pages */
.spec-page { padding: 0 35pt; }
.spec-page-title {
  font-weight: 500; font-size: 14pt; color: ${theme.sectionTitle};
  padding-top: 27pt; margin-bottom: 18pt;
}
.spec-columns { display: table; width: 100%; table-layout: fixed; }
.spec-col { display: table-cell; width: 50%; vertical-align: top; }
.spec-col:first-child { padding-right: 15pt; }
.spec-col:last-child { padding-left: 15pt; }

.spec-category-header {
  background: #6b7580; color: white; font-weight: 500;
  font-size: 7.5pt; padding: 2.5pt 6pt; margin-top: 6pt; margin-bottom: 2pt;
}
.spec-category-header:first-child { margin-top: 0; }
.spec-row { border-bottom: 0.5pt solid #bcbec0; padding: 2pt 0; }
.spec-label { font-weight: 500; font-size: 7pt; color: ${theme.specLabel}; }
.spec-value { font-weight: 300; font-size: 7pt; color: #6f7073; margin-top: 1pt; }

/* Hardware overview */
.hardware-page { padding: 0 35pt; }
.hardware-title {
  font-weight: 500; font-size: 14pt; color: ${theme.sectionTitle};
  padding-top: 31pt; margin-bottom: 16pt;
}
.hardware-image-container { text-align: center; margin: 10pt auto; }
.hardware-image-container img { max-width: 530pt; max-height: 480pt; object-fit: contain; }

/* Footer */
.footer {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: #eff0f2; padding: 14pt 36pt 20pt 36pt;
}
.footer-content { display: table; width: 100%; }
.footer-left { display: table-cell; vertical-align: top; padding-right: 30pt; }
.footer-right { display: table-cell; vertical-align: bottom; width: 75pt; text-align: center; }
.footer-logo { margin-bottom: 6pt; }
.footer-logo img { height: 17pt; }
.footer-disclaimer {
  font-weight: 300; font-size: 5.5pt; color: #6d6e71; line-height: 1.45;
}
.footer-version {
  font-weight: 300; font-size: 5.5pt; color: #6d6e71; margin-top: 4pt;
}
.footer-qr {
  background: white; padding: 2pt 2pt 5pt 2pt; display: inline-block;
}
.footer-qr img { width: 41pt; height: 41pt; display: block; }
.footer-qr-label { font-weight: 400; font-size: 7pt; color: #6b7580; margin-top: 2pt; }

${isCJK ? `
/* ===== CJK Shared — 禁則處理 + line breaking ===== */
.overview-text,
.feature-text,
.spec-label,
.spec-value,
.footer-disclaimer,
.spec-category-header {
  line-break: strict;
  word-break: normal;
  overflow-wrap: break-word;
  text-align: justify;
  text-justify: inter-ideograph;
}

.product-fullname-cloud,
.product-fullname-standard {
  word-break: keep-all;
  overflow-wrap: break-word;
}
.product-fullname-cloud strong,
.product-fullname-standard strong {
  font-weight: 700;
}

.feature-text {
  line-break: strict;
  word-break: normal;
  overflow-wrap: break-word;
  text-align: justify;
  text-justify: inter-ideograph;
}
` : ""}

${typo ? `
/* ===== Per-locale typography (from DB settings) ===== */
.product-fullname-cloud,
.product-fullname-standard {
  font-weight: ${typo.headline_weight}; font-size: ${typo.headline_size}pt; line-height: 1.25;
}
.product-subtitle-cloud,
.product-subtitle-standard {
  font-size: ${typo.subtitle_size}pt;
}
.overview-text {
  font-weight: ${typo.overview_weight}; font-size: ${typo.overview_size}pt; line-height: 1.5; color: ${typo.text_color};
}
.section-title, .features-title {
  font-size: ${typo.section_title_size}pt;
}
.feature-item {
  font-weight: ${typo.features_weight}; font-size: ${typo.features_size}pt; line-height: 1.4; color: ${typo.text_color};
}
.spec-label {
  font-size: ${typo.spec_label_size}pt; font-weight: ${typo.spec_label_weight}; line-height: 1.5;
}
.spec-value {
  font-weight: ${typo.spec_value_weight}; line-height: 1.5;
}
.spec-category-header {
  letter-spacing: ${typo.letter_spacing}pt;
}
.footer-disclaimer {
  font-size: ${typo.footer_size}pt; font-weight: 400; color: #555555; line-height: 1.5;
}
.footer-version {
  font-size: ${typo.footer_size}pt; font-weight: 400; color: #555555;
}
` : ""}
`,
        }}
      />

      {/* PAGE 1: COVER */}
      <div className="page">
        <div className="top-bar-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="logo-img"
            src="/logo/EnGenius-Logo-white.png"
            alt="EnGenius"
          />
          <div className="title-area">
            <span className="title-prefix">{dict.datasheet}</span>
            <span className="title-category"> {productLine.label}</span>
          </div>
        </div>

        <span className="model-name">{product.model_name}</span>

        {theme.isCloud ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="cloud-icon"
              src="/logo/engenius_cloud_icon.png"
              alt=""
            />
            <div className="product-subtitle-cloud">{subtitle}</div>
            <div className="product-fullname-cloud">
              {parseHeadlineMarkup(headline)}
            </div>
          </>
        ) : (
          <>
            <div className="product-subtitle-standard">{subtitle}</div>
            <div className="product-fullname-standard">
              {parseHeadlineMarkup(headline)}
            </div>
          </>
        )}

        {product.product_image && (
          <div className="product-image-container">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.product_image} alt={product.model_name} />
          </div>
        )}

        <div
          className="overview-section"
          style={{ bottom: `${coverLayout.overviewBottom}pt` }}
        >
          <div className="section-title">{dict.overview}</div>
          <div className="overview-text">{overview}</div>
        </div>

        {features.length > 0 && (
          <div className="features-wrapper">
            <div className="features-title">{dict.featuresAndBenefits}</div>
            <div className="features-box">
              <div className="features-columns">
                <div className="features-col">
                  {leftFeatures.map((f, i) => (
                    <div key={i} className="feature-item">
                      <span className="feature-bullet">{dict.bullet}</span>
                      <span className="feature-text">{f}</span>
                    </div>
                  ))}
                </div>
                <div className="features-col">
                  {rightFeatures.map((f, i) => (
                    <div key={i} className="feature-item">
                      <span className="feature-bullet">{dict.bullet}</span>
                      <span className="feature-text">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="page-number">1</div>
      </div>

      {/* SPEC PAGES */}
      {specPages.map((page, pageIdx) => (
        <div key={pageIdx} className="page">
          <div className="top-bar" />
          <div className="spec-page">
            <div className="spec-page-title">{dict.technicalSpecifications}</div>
            <div className="spec-columns">
              <div className="spec-col">
                {page.left.map((section, si) => (
                  <div key={si}>
                    <div className="spec-category-header">
                      {section.category}
                    </div>
                    {section.items.map((item, ii) => (
                      <div key={ii} className="spec-row">
                        <div className="spec-label">{item.label}</div>
                        <div className="spec-value">{item.value}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="spec-col">
                {page.right.map((section, si) => (
                  <div key={si}>
                    <div className="spec-category-header">
                      {section.category}
                    </div>
                    {section.items.map((item, ii) => (
                      <div key={ii} className="spec-row">
                        <div className="spec-label">{item.label}</div>
                        <div className="spec-value">{item.value}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="page-number">{pageIdx + 2}</div>
        </div>
      ))}

      {/* HARDWARE OVERVIEW + FOOTER */}
      <div className="page">
        <div className="top-bar" />
        <div className="hardware-page">
          <div className="hardware-title">{dict.hardwareOverview}</div>
          {(localeHardwareImage || product.hardware_image) && (
            <div className="hardware-image-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={localeHardwareImage || product.hardware_image} alt="Hardware Overview" />
            </div>
          )}
        </div>

        <div className="footer">
          <div className="footer-content">
            <div className="footer-left">
              <div className="footer-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/EnGenius-Logo-gray.png" alt="EnGenius" />
              </div>
              <div className="footer-disclaimer">{dict.disclaimer}</div>
              <div className="footer-version">
                Version {version} &nbsp; {today}
              </div>
            </div>
            <div className="footer-right">
              <div className="footer-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUrl} alt="QR Code" />
              </div>
              <div className="footer-qr-label">{qrLabel}</div>
            </div>
          </div>
        </div>

        <div className="page-number">{totalPages}</div>
      </div>
    </>
  );
}
