import { isCheckValue, type SpecCategory } from "./spec-matrix";

/**
 * Build the comparison matrix as an .xlsx and hand it to the browser.
 *
 * The layout mirrors the page: one header row of models, a full-width band
 * per category, then its spec rows. The header row and the Spec column are
 * frozen so the sheet reads the same way the table does when scrolled.
 * Differing rows are not tinted: in most product lines nearly every row
 * differs, so a fill turns the whole sheet yellow and marks nothing — the
 * "Only differences" filter is what narrows an export.
 *
 * exceljs is loaded on click rather than with the page — it is ~1 MB and
 * almost nobody who opens a comparison exports it.
 */

const BRAND = "FF03A9F4";
const BRAND_TINT = "FFE1F5FE";
const HEADER_FILL = "FFF1F3F5";
const TEXT = "FF2C3345";
const MUTED = "FF9AA0AC";
const BORDER = "FFD9DDE3";

export interface ExportInput {
  title: string;
  models: string[];
  categories: SpecCategory[];
}

export async function exportComparisonXlsx({ title, models, categories }: ExportInput): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ws = wb.addWorksheet("Spec Comparison", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });

  const thin = { style: "thin" as const, color: { argb: BORDER } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };

  const header = ws.addRow(["Spec", ...models]);
  header.height = 22;
  header.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: col === 1 ? TEXT : BRAND } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
    cell.border = border;
  });

  for (const cat of categories) {
    const band = ws.addRow([`${cat.name.toUpperCase()}  (${cat.rows.length})`]);
    ws.mergeCells(band.number, 1, band.number, models.length + 1);
    const bandCell = band.getCell(1);
    bandCell.font = { bold: true, color: { argb: BRAND } };
    bandCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_TINT } };
    bandCell.alignment = { vertical: "middle" };
    bandCell.border = border;
    band.height = 20;

    for (const row of cat.rows) {
      const r = ws.addRow([
        row.label,
        ...models.map((m) => {
          const v = row.values[m] ?? "";
          if (isCheckValue(v)) return "✓";
          return v.trim() === "" ? "—" : v;
        }),
      ]);
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        const blank = col > 1 && cell.value === "—";
        const check = col > 1 && cell.value === "✓";
        cell.font = {
          bold: col === 1 || check,
          color: { argb: blank ? MUTED : check ? BRAND : TEXT },
        };
        cell.alignment = {
          vertical: "top",
          horizontal: col === 1 ? "left" : "center",
          wrapText: true,
        };
        cell.border = border;
      });
    }
  }

  // Width from content, clamped: wrapText takes over past the cap.
  const widthOf = (s: string) => Math.max(...s.split("\n").map((l) => l.length));
  ws.getColumn(1).width = clamp(
    Math.max(8, ...categories.flatMap((c) => c.rows.map((r) => widthOf(r.label)))) + 2,
    16,
    40
  );
  models.forEach((m, i) => {
    const longest = Math.max(
      m.length,
      ...categories.flatMap((c) => c.rows.map((r) => widthOf(r.values[m] ?? "")))
    );
    ws.getColumn(i + 2).width = clamp(longest + 2, 12, 36);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(title);
  a.click();
  URL.revokeObjectURL(url);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** `Spec-Comparison_Cloud-Camera_2026-09-21.xlsx`, dated in Taipei like the rest of the app. */
function exportFileName(title: string): string {
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
  const slug = title.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-");
  return `Spec-Comparison_${slug}_${date}.xlsx`;
}
