/**
 * Dry-run of the updated spec parser against actual Google Sheet data.
 * Doesn't write to DB — just shows what categories the new pattern-based
 * logic would extract per product line.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { getGoogleAuth } from "../src/lib/google/auth";
config({ path: ".env.local" });

// Reproduce parseSpecSections + isRowOnlyLabel here so we can run standalone
function isRowOnlyLabel(row: unknown[] | undefined): boolean {
  if (!row || row.length <= 1) return true;
  for (let c = 1; c < row.length; c++) {
    const v = String(row[c] ?? "").trim();
    if (v) return false;
  }
  return true;
}

function getCell(row: unknown[] | undefined, colIdx: number): string {
  if (!row || colIdx >= row.length) return "";
  const val = row[colIdx];
  if (val == null) return "";
  return String(val).trim();
}

function parseSpecSections(rows: unknown[][], colIdx: number) {
  const sections: { category: string; items: { label: string; value: string }[] }[] = [];
  let currentCategory: string | null = null;
  let currentItems: { label: string; value: string }[] = [];

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

    if (isRowOnlyLabel(rows[i])) {
      if (currentCategory && currentItems.length > 0) {
        sections.push({ category: currentCategory, items: currentItems });
      }
      currentCategory = label;
      currentItems = [];
      continue;
    }

    if (!value || value === "-") continue;

    if (!currentCategory) currentCategory = "General";
    currentItems.push({ label, value });
  }

  if (currentCategory && currentItems.length > 0) {
    sections.push({ category: currentCategory, items: currentItems });
  }

  return sections;
}

function findModelColumn(rows: unknown[][], modelNumber: string): number | null {
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (String(rows[r][c] ?? "").trim() === modelNumber) return c;
    }
  }
  return null;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: lines } = await supabase
    .from("product_lines")
    .select("id, name, label, sheet_id, detail_specs_gid")
    .order("sort_order");

  const auth = await getGoogleAuth();
  const sheetsApi = google.sheets({ version: "v4", auth });

  // Resolve gid → sheet name (Detail Specs usually)
  async function getSheetTitleForGid(sheetId: string, gid: number | string): Promise<string | null> {
    const meta = await sheetsApi.spreadsheets.get({ spreadsheetId: sheetId });
    const sheet = meta.data.sheets?.find((s) => String(s.properties?.sheetId) === String(gid));
    return sheet?.properties?.title ?? null;
  }

  // Pick one model per product line to test
  const testCases = [
    { line: "Cloud AP", model: "ECW336" },
    { line: "Cloud L3 SW", model: "ECS8854F" },
    { line: "Cloud SW", model: "ECS1528P" },
    { line: "Unmgd SW", model: "ES108" },
    { line: "Extender", model: "EXT1105P" },
  ];

  for (const { line, model } of testCases) {
    const productLine = (lines ?? []).find((l: any) => l.label === line);
    if (!productLine) {
      console.log(`\n⚠ Product line "${line}" not found`);
      continue;
    }

    console.log(`\n━━━ ${line}: ${model} ━━━`);

    const sheetId = (productLine as any).sheet_id;
    const gid = (productLine as any).detail_specs_gid;
    if (!sheetId || gid == null) {
      console.log(`  ⚠ Missing sheet_id (${sheetId}) or detail_specs_gid (${gid})`);
      continue;
    }

    const sheetTitle = await getSheetTitleForGid(sheetId, gid);
    if (!sheetTitle) {
      console.log(`  ⚠ Sheet tab with gid ${gid} not found`);
      continue;
    }

    const res = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: sheetTitle,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = (res.data.values ?? []) as unknown[][];
    console.log(`  Sheet tab: "${sheetTitle}" (${rows.length} rows)`);

    const colIdx = findModelColumn(rows, model);
    if (colIdx === null) {
      console.log(`  ⚠ Model "${model}" not found in sheet header rows`);
      continue;
    }

    const sections = parseSpecSections(rows, colIdx);
    console.log(`  → ${sections.length} categories detected:`);
    for (const sec of sections) {
      console.log(`    • "${sec.category}"  (${sec.items.length} items)`);
      // Show first 3 item labels as sanity check
      const preview = sec.items.slice(0, 3).map((it) => it.label).join(", ");
      if (preview) console.log(`        [${preview}${sec.items.length > 3 ? `, +${sec.items.length - 3} more` : ""}]`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
