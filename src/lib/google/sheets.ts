import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

/**
 * Category detection rule (pattern-based, no hardcoded list):
 *
 *   A row is a CATEGORY HEADER if column A has text AND every cell from
 *   column B onwards is empty or just "-". Otherwise it's a SPEC ITEM
 *   row (label + at least one model has a value).
 *
 * Replaces the old hardcoded SPEC_CATEGORIES whitelist, which silently
 * lost categories the PM hadn't named exactly like the Python port
 * (e.g. "Environmental & Physical", "Device Dimensions & Weight", and
 * almost every AP sheet's categories).
 *
 * PM rule: to introduce a new category, put its name in column A and
 * leave ALL model columns empty on that row. Don't put spaces or dashes
 * in the model cells.
 */

export interface SheetSpecItem {
  label: string;
  value: string;
}

export interface SheetSpecSection {
  category: string;
  items: SheetSpecItem[];
}

export interface SheetProduct {
  model_name: string;
  subtitle: string;
  full_name: string;
  overview: string;
  headline: string;
  features: string[];
  status: string;
  spec_sections: SheetSpecSection[];
}

export interface SheetMetadata {
  last_modified: string | null;
  last_editor: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCell(row: unknown[] | undefined, colIdx: number): string {
  if (!row || colIdx >= row.length) return "";
  const val = row[colIdx];
  if (val == null) return "";
  return String(val).trim();
}

function findModelColumn(rows: unknown[][], modelNumber: string): number | null {
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (String(rows[r][c] ?? "").trim() === modelNumber) return c;
    }
  }
  return null;
}

function findRowByLabel(rows: unknown[][], label: string): number | null {
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i]?.[0] ?? "").trim() === label) return i;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parse spec sections from Detail Specs tab
// ---------------------------------------------------------------------------

/**
 * True if column A is the ONLY cell with content in this row. Used to
 * detect category header rows — "Environmental & Physical" with every
 * model column completely empty.
 *
 * STRICT: "-" counts as a value (per the project convention it means
 * "not applicable" — still a meaningful marker). Only a totally empty
 * string makes a cell count as empty. This matters because some PMs
 * leave PoE rows blank for L3 switches; those rows would otherwise be
 * mistakenly treated as category headers. The PM fix is to put "-" in
 * not-applicable cells, or delete the row entirely.
 */
function isRowOnlyLabel(row: unknown[] | undefined): boolean {
  if (!row || row.length <= 1) return true;
  for (let c = 1; c < row.length; c++) {
    const v = String(row[c] ?? "").trim();
    if (v) return false; // any content (including "-") → row has values
  }
  return true;
}

function parseSpecSections(rows: unknown[][], colIdx: number): SheetSpecSection[] {
  const sections: SheetSpecSection[] = [];
  let currentCategory: string | null = null;
  let currentItems: SheetSpecItem[] = [];

  // Find where "Technical Specifications" starts
  let startRow = 0;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i]?.[0] ?? "").trim() === "Technical Specifications") {
      startRow = i + 1;
      break;
    }
  }

  for (let i = startRow; i < rows.length; i++) {
    const label = String(rows[i]?.[0] ?? "").trim();
    const value = getCell(rows[i], colIdx);

    if (!label) continue;

    // Pattern-based category detection: column A has text, all other
    // cells empty → category header. Works across all product lines
    // without maintaining a hardcoded whitelist.
    if (isRowOnlyLabel(rows[i])) {
      if (currentCategory && currentItems.length > 0) {
        sections.push({ category: currentCategory, items: currentItems });
      }
      currentCategory = label;
      currentItems = [];
      continue;
    }

    // Spec item rows: skip if this particular model has no value for it
    if (!value || value === "-") continue;

    // Fallback: if no category has been set yet, create a "General" category.
    // This handles sheets where spec items start immediately after
    // "Technical Specifications" without a category header first.
    if (!currentCategory) {
      currentCategory = "General";
    }

    currentItems.push({ label, value });
  }

  if (currentCategory && currentItems.length > 0) {
    sections.push({ category: currentCategory, items: currentItems });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Parse overview data from Web Overview tab
// ---------------------------------------------------------------------------

function parseOverviewData(
  rows: unknown[][],
  colIdx: number
): { full_name: string; headline: string; overview: string; features: string[]; status: string } {
  let full_name = "";
  let headline = "";
  let overview = "";
  let status = "active";
  const features: string[] = [];

  // Build label → row index map
  const rowMap = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const label = String(rows[i]?.[0] ?? "").trim();
    if (label) rowMap.set(label, i);
  }

  // Model Name (previously "Model Description" in some sheets)
  const descIdx = rowMap.get("Model Name") ?? rowMap.get("Model Description");
  if (descIdx !== undefined) {
    full_name = getCell(rows[descIdx], colIdx);
  }

  // Headline
  const headlineIdx = rowMap.get("Headline");
  if (headlineIdx !== undefined) {
    headline = getCell(rows[headlineIdx], colIdx);
  }

  // Status (Active / Upcoming / Pending)
  for (const row of rows) {
    const label = String(row?.[0] ?? "").trim().toLowerCase();
    if (label === "status") {
      const val = getCell(row, colIdx).toLowerCase().trim();
      if (val === "upcoming") {
        status = "upcoming";
      } else if (val === "pending") {
        status = "pending";
      }
      break;
    }
  }

  // Overview — prefer "Single Overview" (MKT rewrite)
  for (const row of rows) {
    const label = String(row?.[0] ?? "").trim();
    if (label.includes("Single Overview")) {
      const val = getCell(row, colIdx);
      if (val) { overview = val; break; }
    }
  }
  if (!overview) {
    for (const row of rows) {
      const label = String(row?.[0] ?? "").trim();
      if (label.includes("Overview") && !label.includes("Single")) {
        const val = getCell(row, colIdx);
        if (val) { overview = val; break; }
      }
    }
  }

  // Features — single cell with newline-separated entries
  // Supports both "* Feature text" (bullet prefix) and plain lines
  for (const row of rows) {
    const label = String(row?.[0] ?? "").trim();
    if (label.includes("Key Feature Lists") || label.includes("Key Feature")) {
      const cellValue = getCell(row, colIdx);
      if (cellValue) {
        for (const line of cellValue.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          // Strip leading bullet markers: *, •, -, etc.
          const text = trimmed.replace(/^[*•\-–]\s*/, "").trim();
          if (text) features.push(text);
        }
      }
      if (features.length > 0) break;
    }
  }

  return { full_name, headline, overview, features, status };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get sheet metadata (last modified time, last editor) using Drive API.
 */
export async function getSheetMetadata(sheetId: string): Promise<SheetMetadata> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.get({
    fileId: sheetId,
    fields: "modifiedTime,lastModifyingUser",
    supportsAllDrives: true,
  });

  return {
    last_modified: res.data.modifiedTime ?? null,
    last_editor: res.data.lastModifyingUser?.emailAddress ?? res.data.lastModifyingUser?.displayName ?? null,
  };
}

/**
 * List all model numbers from a sheet's Detail Specs tab.
 */
export async function listModelsFromSheet(
  sheetId: string,
  detailSpecsGid: string
): Promise<{ model_name: string; subtitle: string }[]> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Get all sheet names to find the one matching the GID
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets.properties",
  });

  const targetSheet = meta.data.sheets?.find(
    (s) => String(s.properties?.sheetId) === detailSpecsGid
  );
  const sheetName = targetSheet?.properties?.title ?? "Detail Specs";

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${sheetName}'`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = (res.data.values ?? []) as unknown[][];
  if (rows.length < 2) return [];

  // Find "Model #" row and "Model Name" row
  const numRowIdx = findRowByLabel(rows, "Model #") ?? 2;
  const nameRowIdx = findRowByLabel(rows, "Model Name") ?? 0;
  const modelNumRow = rows[numRowIdx] ?? [];

  const models: { model_name: string; subtitle: string }[] = [];

  for (let col = 1; col < modelNumRow.length; col++) {
    const modelNum = String(modelNumRow[col] ?? "").trim();
    const modelName = getCell(rows[nameRowIdx], col);

    if (!modelNum || modelName.includes("Vivotek")) continue;

    models.push({ model_name: modelNum, subtitle: modelName });
  }

  return models;
}

/**
 * Load full product data for a specific model from Google Sheets.
 */
export async function loadProductFromSheets(
  sheetId: string,
  detailSpecsGid: string,
  overviewGid: string,
  modelNumber: string
): Promise<SheetProduct | null> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Get sheet names
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets.properties",
  });

  const sheetsList = meta.data.sheets ?? [];
  const detailSheet = sheetsList.find(
    (s) => String(s.properties?.sheetId) === detailSpecsGid
  );
  const overviewSheet = sheetsList.find(
    (s) => String(s.properties?.sheetId) === overviewGid
  );

  const detailName = detailSheet?.properties?.title ?? "Detail Specs";
  const overviewName = overviewSheet?.properties?.title ?? "Web Overview";

  // Fetch both tabs in parallel
  const [detailRes, overviewRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${detailName}'`,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${overviewName}'`,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
  ]);

  const detailRows = (detailRes.data.values ?? []) as unknown[][];
  const overviewRows = (overviewRes.data.values ?? []) as unknown[][];

  // Find model column in detail tab
  const detailCol = findModelColumn(detailRows, modelNumber);
  if (detailCol === null) return null;

  // Find model column in overview tab
  const overviewCol = findModelColumn(overviewRows, modelNumber);

  // Parse subtitle from "Model Name" row
  const nameRowIdx = findRowByLabel(detailRows, "Model Name") ?? 0;
  const subtitle = getCell(detailRows[nameRowIdx], detailCol);

  // Parse specs
  const spec_sections = parseSpecSections(detailRows, detailCol);

  // Parse overview
  let overviewData = { full_name: "", headline: "", overview: "", features: [] as string[], status: "active" };
  if (overviewCol !== null) {
    overviewData = parseOverviewData(overviewRows, overviewCol);
  }

  return {
    model_name: modelNumber,
    subtitle,
    full_name: overviewData.full_name || subtitle,
    headline: overviewData.headline,
    overview: overviewData.overview,
    features: overviewData.features,
    status: overviewData.status,
    spec_sections,
  };
}

/**
 * Load ALL products from a sheet in batch — only 3 API calls total per product line.
 * Returns a map of model_name → SheetProduct.
 */
export async function loadAllProductsFromSheet(
  sheetId: string,
  detailSpecsGid: string,
  overviewGid: string
): Promise<Map<string, SheetProduct>> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // 1 API call: get sheet tab names
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets.properties",
  });

  const sheetsList = meta.data.sheets ?? [];
  const detailSheet = sheetsList.find(
    (s) => String(s.properties?.sheetId) === detailSpecsGid
  );
  const overviewSheet = sheetsList.find(
    (s) => String(s.properties?.sheetId) === overviewGid
  );

  const detailName = detailSheet?.properties?.title ?? "Detail Specs";
  const overviewName = overviewSheet?.properties?.title ?? "Web Overview";

  // 2 API calls: fetch both tabs in parallel
  const [detailRes, overviewRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${detailName}'`,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${overviewName}'`,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
  ]);

  const detailRows = (detailRes.data.values ?? []) as unknown[][];
  const overviewRows = (overviewRes.data.values ?? []) as unknown[][];

  // Find "Model #" row to enumerate all model columns
  const numRowIdx = findRowByLabel(detailRows, "Model #") ?? 2;
  const nameRowIdx = findRowByLabel(detailRows, "Model Name") ?? 0;
  const modelNumRow = detailRows[numRowIdx] ?? [];

  const results = new Map<string, SheetProduct>();

  for (let col = 1; col < modelNumRow.length; col++) {
    const modelNum = String(modelNumRow[col] ?? "").trim();
    if (!modelNum) continue;

    const subtitle = getCell(detailRows[nameRowIdx], col);
    if (subtitle.includes("Vivotek")) continue;

    // Parse specs from cached detail data
    const spec_sections = parseSpecSections(detailRows, col);

    // Parse overview from cached overview data
    const overviewCol = findModelColumn(overviewRows, modelNum);
    let overviewData = { full_name: "", headline: "", overview: "", features: [] as string[], status: "active" };
    if (overviewCol !== null) {
      overviewData = parseOverviewData(overviewRows, overviewCol);
    }

    results.set(modelNum, {
      model_name: modelNum,
      subtitle,
      full_name: overviewData.full_name || subtitle,
      headline: overviewData.headline,
      overview: overviewData.overview,
      features: overviewData.features,
      status: overviewData.status,
      spec_sections,
    });
  }

  return results;
}
