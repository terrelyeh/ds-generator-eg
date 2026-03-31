import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cell(row: unknown[] | undefined, col: number): string {
  if (!row || col >= row.length) return "";
  const val = row[col];
  if (val == null) return "";
  return String(val).trim();
}

/**
 * Resolve a GID to its tab name within a spreadsheet.
 */
async function resolveTabName(
  sheetId: string,
  gid: string
): Promise<string | null> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets.properties",
  });
  const tab = meta.data.sheets?.find(
    (s) => String(s.properties?.sheetId) === gid
  );
  return tab?.properties?.title ?? null;
}

/**
 * Fetch all rows from a tab.
 */
async function fetchTab(
  sheetId: string,
  tabName: string
): Promise<unknown[][]> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${tabName}'`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (res.data.values ?? []) as unknown[][];
}

/**
 * Get hidden column indices for a specific tab using Sheets metadata API.
 * Returns a Set of 0-based column indices that are hidden.
 */
async function getHiddenColumns(
  sheetId: string,
  gid: string
): Promise<Set<number>> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets(properties,data.columnMetadata)",
  });

  const targetSheet = meta.data.sheets?.find(
    (s) => String(s.properties?.sheetId) === gid
  );
  if (!targetSheet?.data?.[0]?.columnMetadata) return new Set();

  const hidden = new Set<number>();
  for (let i = 0; i < targetSheet.data[0].columnMetadata.length; i++) {
    if (targetSheet.data[0].columnMetadata[i].hiddenByUser) {
      hidden.add(i);
    }
  }
  return hidden;
}

// ---------------------------------------------------------------------------
// Revision Log
// ---------------------------------------------------------------------------

export interface SheetRevisionLog {
  revision_date: string;
  parsed_date: string | null;
  editor: string;
  action: string;
  target_page: string;
  change_type: string;
  description: string;
  mkt_close_date: string;
}

/**
 * Parse date values from revision logs.
 * Google Sheets UNFORMATTED_VALUE returns dates as Excel serial numbers (e.g. 45512).
 * Also handles: "2024/02/26", "231124", "20250207", "8月-08"
 */
function parseRevisionDate(raw: string): string | null {
  if (!raw) return null;

  // "2024/02/26" or "2024-02-26"
  const isoMatch = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  // "20250207" (8 digits, YYYYMMdd)
  const compact8 = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact8) {
    return `${compact8[1]}-${compact8[2]}-${compact8[3]}`;
  }

  // "231124" (6 digits, YYMMdd)
  const compact6 = raw.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compact6) {
    const year = parseInt(compact6[1]) > 50 ? `19${compact6[1]}` : `20${compact6[1]}`;
    return `${year}-${compact6[2]}-${compact6[3]}`;
  }

  // "8月-08" or "1月-07" (Chinese month format, no year — assume current/recent year)
  const cnMatch = raw.match(/^(\d{1,2})月-(\d{2})$/);
  if (cnMatch) {
    const month = cnMatch[1].padStart(2, "0");
    const day = cnMatch[2];
    const now = new Date();
    const year = parseInt(month) > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear();
    return `${year}-${month}-${day}`;
  }

  // Excel serial number (exactly 5 digits, range 30000-60000 for ~1982-2064)
  if (/^\d{5}$/.test(raw)) {
    const serial = parseInt(raw);
    if (serial >= 30000 && serial <= 60000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      const d = String(date.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

export async function loadRevisionLogs(
  sheetId: string,
  gid: string
): Promise<SheetRevisionLog[]> {
  const tabName = await resolveTabName(sheetId, gid);
  if (!tabName) return [];

  const rows = await fetchTab(sheetId, tabName);
  if (rows.length < 2) return [];

  // Skip header row (row 0)
  const results: SheetRevisionLog[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const description = cell(row, 5);
    if (!description) continue; // skip empty rows

    const rawDate = cell(row, 0);
    results.push({
      revision_date: rawDate,
      parsed_date: parseRevisionDate(rawDate),
      editor: cell(row, 1),
      action: cell(row, 2),
      target_page: cell(row, 3),
      change_type: cell(row, 4),
      description,
      mkt_close_date: cell(row, 6) || cell(row, 7) || "",
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Comparison (full spec comparison)
// ---------------------------------------------------------------------------

export interface SheetComparisonItem {
  model_name: string;
  category: string;
  label: string;
  value: string;
}

export async function loadComparison(
  sheetId: string,
  gid: string
): Promise<{ models: string[]; items: SheetComparisonItem[] }> {
  const tabName = await resolveTabName(sheetId, gid);
  if (!tabName) return { models: [], items: [] };

  // Fetch rows + hidden column info in parallel
  const [rows, hiddenCols] = await Promise.all([
    fetchTab(sheetId, tabName),
    getHiddenColumns(sheetId, gid),
  ]);
  if (rows.length < 3) return { models: [], items: [] };

  // Find the "Model #" or "Model Name" row to get model columns
  let modelRow = -1;
  let modelNameRow = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const label = cell(rows[i], 0).toLowerCase();
    const label1 = cell(rows[i], 1).toLowerCase();
    if (label === "model #" || label1 === "model #") {
      modelRow = i;
    }
    if (label === "model name" || label1 === "model name") {
      modelNameRow = i;
    }
  }

  // Determine which row has the model identifiers
  const idRow = modelRow >= 0 ? modelRow : modelNameRow >= 0 ? modelNameRow : 2;
  const startCol = cell(rows[idRow], 0) ? 0 : 1; // some sheets have empty col A

  // Collect model names from the header row, skipping hidden columns
  const models: string[] = [];
  const modelCols: number[] = [];
  for (let c = startCol; c < (rows[idRow]?.length ?? 0); c++) {
    if (hiddenCols.has(c)) continue; // skip hidden columns
    const m = cell(rows[idRow], c);
    if (m && m !== "Model #" && m !== "Model Name" && !m.includes("Model")) {
      models.push(m);
      modelCols.push(c);
    }
  }

  // Parse spec data using DYNAMIC category detection.
  // A category row = has text in col A but ALL model columns are empty.
  // A data row = has text in col A AND at least one model column has a value.
  const items: SheetComparisonItem[] = [];
  let currentCategory = "";

  // Skip known non-category labels in the header area
  const skipLabels = new Set(["model #", "model name", "model", "subtitle"]);

  for (let i = idRow + 1; i < rows.length; i++) {
    const label = cell(rows[i], 0) || cell(rows[i], 1);
    if (!label) continue;
    if (skipLabels.has(label.toLowerCase())) continue;

    // Check if ANY model column has ANY text at all (even "-").
    // A real category header row has completely blank model columns.
    // "-" means "not applicable" and counts as data — it's NOT a blank cell.
    let hasAnyText = false;
    for (const col of modelCols) {
      const val = cell(rows[i], col);
      if (val) {
        hasAnyText = true;
        break;
      }
    }

    if (!hasAnyText) {
      // Category header row — all model columns are completely blank
      currentCategory = label;
      continue;
    }

    // Data row — belongs to current category
    if (!currentCategory) {
      // If no category yet, use a generic fallback
      currentCategory = "General";
    }

    for (let m = 0; m < models.length; m++) {
      const value = cell(rows[i], modelCols[m]);
      if (value && value !== "-") {
        items.push({
          model_name: models[m],
          category: currentCategory,
          label,
          value,
        });
      }
    }
  }

  return { models, items };
}

// ---------------------------------------------------------------------------
// Cloud Comparison (summary table)
// ---------------------------------------------------------------------------

export interface SheetCloudComparison {
  model_name: string;
  label: string;
  specs: Record<string, string>;
}

export async function loadCloudComparison(
  sheetId: string,
  gid: string
): Promise<SheetCloudComparison[]> {
  const tabName = await resolveTabName(sheetId, gid);
  if (!tabName) return [];

  // Fetch rows + hidden column info in parallel
  const [rows, hiddenCols] = await Promise.all([
    fetchTab(sheetId, tabName),
    getHiddenColumns(sheetId, gid),
  ]);
  if (rows.length < 2) return [];

  // Row 0 is headers — build visible header list
  const allHeaders = rows[0].map((h) => String(h ?? "").trim().replace(/\n/g, " "));

  // Find Model and Label columns (even if hidden, we still need them for identification)
  const modelCol = allHeaders.findIndex(
    (h) => h.toLowerCase() === "model" || h.toLowerCase() === "model #" || h.toLowerCase() === "model name"
  );
  const labelCol = allHeaders.findIndex((h) => h.toLowerCase() === "label");

  if (modelCol < 0) return [];

  // Build list of visible spec columns (skip hidden, model, label columns)
  const specCols: number[] = [];
  for (let c = 0; c < allHeaders.length; c++) {
    if (c === modelCol || c === labelCol) continue;
    if (hiddenCols.has(c)) continue; // skip hidden columns
    if (allHeaders[c]) specCols.push(c);
  }

  const results: SheetCloudComparison[] = [];
  for (let i = 1; i < rows.length; i++) {
    const model = cell(rows[i], modelCol);
    if (!model) continue;

    const label = labelCol >= 0 ? cell(rows[i], labelCol) : "";
    const specs: Record<string, string> = {};

    for (const c of specCols) {
      const val = cell(rows[i], c);
      if (val && val !== "-") {
        specs[allHeaders[c]] = val;
      }
    }

    results.push({ model_name: model, label, specs });
  }

  return results;
}
