import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { splitIntoPages } from "@/lib/datasheet/pagination";
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

export default async function PreviewPage({
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
      spec_sections (*, spec_items (*))
    `
    )
    .eq("model_name", model)
    .single();

  const product = data as ProductQueryRow | null;
  if (!product) notFound();

  const specSections = (product.spec_sections ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      category: s.category,
      items: (s.spec_items ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({ label: i.label, value: i.value })),
    }));

  const specPages = splitIntoPages(specSections);
  const features = product.features ?? [];
  const midpoint = Math.ceil(features.length / 2);
  const version = product.current_version || "1.0";
  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const productLine = product.product_lines;
  const theme = getTheme(productLine.category);
  const qsgUrl = `https://qr.engenius.ai/qsg/${product.model_name.toLowerCase()}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qsgUrl)}`;
  const totalPages = 1 + specPages.length + 1; // cover + specs + hardware

  return (
    <>
      <PrintToolbar model={product.model_name} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap');

@page { size: letter; margin: 0; }

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}

body {
  font-family: 'Roboto', sans-serif;
  color: #6f6f6f;
  font-size: 7pt;
  line-height: 1.4;
  background: #e0e0e0;
  padding-top: 48px;
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
  position: absolute; right: 10pt; top: 330pt;
  width: 310pt; height: 270pt; text-align: center;
}
.product-image-container img {
  max-width: 290pt; max-height: 260pt; object-fit: contain;
}

.section-title {
  font-weight: 500; font-size: 14pt; color: ${theme.sectionTitle}; margin-bottom: 8pt;
}
.overview-section {
  position: absolute; left: 36pt; top: 270pt; width: 270pt;
}
.overview-text {
  font-weight: 400; font-size: 11pt; color: #6f6f6f; line-height: 1.35;
}

.features-wrapper {
  position: absolute; left: 36pt; right: 36pt; bottom: 36pt;
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
            <span className="title-prefix">Datasheet |</span>
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
            <div className="product-subtitle-cloud">{product.subtitle}</div>
            <div className="product-fullname-cloud">
              {product.headline || product.full_name}
            </div>
          </>
        ) : (
          <>
            <div className="product-subtitle-standard">{product.subtitle}</div>
            <div className="product-fullname-standard">
              {product.headline || product.full_name}
            </div>
          </>
        )}

        {product.product_image && (
          <div className="product-image-container">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.product_image} alt={product.model_name} />
          </div>
        )}

        <div className="overview-section">
          <div className="section-title">Overview</div>
          <div className="overview-text">{product.overview}</div>
        </div>

        {features.length > 0 && (
          <div className="features-wrapper">
            <div className="features-title">Features &amp; Benefits</div>
            <div className="features-box">
              <div className="features-columns">
                <div className="features-col">
                  {features.slice(0, midpoint).map((f, i) => (
                    <div key={i} className="feature-item">
                      <span className="feature-bullet">●</span>
                      <span className="feature-text">{f}</span>
                    </div>
                  ))}
                </div>
                <div className="features-col">
                  {features.slice(midpoint).map((f, i) => (
                    <div key={i} className="feature-item">
                      <span className="feature-bullet">●</span>
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
            <div className="spec-page-title">Technical Specifications</div>
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
          <div className="hardware-title">Hardware Overview</div>
          {product.hardware_image && (
            <div className="hardware-image-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.hardware_image} alt="Hardware Overview" />
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
              <div className="footer-disclaimer">
                Features and specifications subject to change without notice.
                Trademarks and registered trademarks are the property of their
                respective owners. These limits are designed to provide
                reasonable protection against harmful interference in a
                residential installation. This equipment generates, uses, and can
                radiate radio frequency energy and, if not installed and used in
                accordance with the instructions, may cause harmful interference
                to radio communications. Operation of this equipment in a
                residential area is likely to cause harmful interference in which
                case the user will be required to correct the interference at
                his/her own expense. Prior to installing any surveillance
                equipment, it is your responsibility to ensure the installation
                is in compliance with local, state and federal video and audio
                surveillance and privacy laws.
              </div>
              <div className="footer-version">
                Version {version} &nbsp; {today}
              </div>
            </div>
            <div className="footer-right">
              <div className="footer-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUrl} alt="QR Code" />
              </div>
              <div className="footer-qr-label">Quick Start Guide</div>
            </div>
          </div>
        </div>

        <div className="page-number">{totalPages}</div>
      </div>
    </>
  );
}
