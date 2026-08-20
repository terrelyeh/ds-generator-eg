/**
 * Plain-text ⇄ jsonb for the project datasheet editor.
 *
 * Every structured field in this module is edited as text rather than through
 * a bespoke widget. That is a deliberate M1 choice, not a shortcut: the input
 * is nearly always a block of rows pasted straight out of a supplier's PDF or
 * spreadsheet, and a paste target beats a row-by-row form for that by a wide
 * margin. Widgets can come later for the parts that turn out to need them.
 *
 * The formats are chosen so that a raw paste from a PDF table already almost
 * parses — tab-separated, with continuation lines for multi-line cells,
 * because that is exactly what a copied table looks like on the clipboard.
 */

import { normalizeKey } from "./resolve";
import type { AddedRow, FeatureBlock, ModelImage, RawSpecRow, SpecRules } from "./types";

// ── spec rows ──────────────────────────────────────────────────────────────
//
//   Model            M16K06
//   Interface        1 × GbE LAN
//                    1 Reset Button          ← continuation (blank label)
//   ## software                              ← everything after joins a group
//   VPN              IPSec / L2TP / PPTP
//
// A line whose label is empty appends to the previous row's value, which is
// how a copied table's wrapped cells arrive.

export function parseSpecRows(text: string): RawSpecRow[] {
  const rows: RawSpecRow[] = [];
  let group = "spec";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;

    const groupMatch = line.match(/^\s*##\s*(\S+)/);
    if (groupMatch) {
      group = groupMatch[1].toLowerCase();
      continue;
    }

    // Split on a tab, or on 2+ spaces when the paste lost its tabs.
    const parts = line.includes("\t") ? line.split("\t") : line.split(/ {2,}/);
    const label = (parts[0] ?? "").trim();
    const value = parts.slice(1).join(" ").trim();

    if (!label) {
      const prev = rows[rows.length - 1];
      if (prev && value) prev.value = prev.value ? `${prev.value}\n${value}` : value;
      continue;
    }

    rows.push({ key: normalizeKey(label), label, value, group, confidence: null });
  }

  return rows;
}

export function serializeSpecRows(rows: RawSpecRow[]): string {
  const out: string[] = [];
  let group = "spec";
  for (const r of rows) {
    const g = r.group ?? "spec";
    if (g !== group) {
      out.push(`## ${g}`);
      group = g;
    }
    const [head, ...rest] = r.value.split("\n");
    out.push(`${r.label}\t${head ?? ""}`);
    for (const line of rest) out.push(`\t${line}`);
  }
  return out.join("\n");
}

// ── rules ──────────────────────────────────────────────────────────────────
//
//   - cpu                    hide this row
//   ingress_protection = IP67    override (or invent) a value
//   ~ power_consumption = Power over Ethernet   rename the label
//   + Power over Ethernet = 802.3af/at          add a row
//   ? antenna = na           blank mode for this cell (tbd | na | blank)

export function parseRules(text: string): SpecRules {
  const hide: string[] = [];
  const override: Record<string, string> = {};
  const rename: Record<string, string> = {};
  const blank: Record<string, "tbd" | "na" | "blank"> = {};
  const add: AddedRow[] = [];
  let group = "spec";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const groupMatch = line.match(/^##\s*(\S+)/);
    if (groupMatch) {
      group = groupMatch[1].toLowerCase();
      continue;
    }
    if (line.startsWith("#")) continue; // comment

    if (line.startsWith("-")) {
      const key = line.slice(1).trim();
      if (key) hide.push(normalizeKey(key));
      continue;
    }

    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const lhs = line.slice(0, eq).trim();
    const rhs = line.slice(eq + 1).trim();

    if (lhs.startsWith("+")) {
      const label = lhs.slice(1).trim();
      if (label) add.push({ key: normalizeKey(label), label, value: rhs, group });
    } else if (lhs.startsWith("~")) {
      const key = normalizeKey(lhs.slice(1).trim());
      if (key) rename[key] = rhs;
    } else if (lhs.startsWith("?")) {
      const key = normalizeKey(lhs.slice(1).trim());
      if (key && (rhs === "tbd" || rhs === "na" || rhs === "blank")) blank[key] = rhs;
    } else {
      const key = normalizeKey(lhs);
      if (key) override[key] = rhs;
    }
  }

  const rules: SpecRules = {};
  if (hide.length) rules.hide = hide;
  if (Object.keys(override).length) rules.override = override;
  if (Object.keys(rename).length) rules.rename = rename;
  if (Object.keys(blank).length) rules.blank = blank;
  if (add.length) rules.add = add;
  return rules;
}

export function serializeRules(rules: SpecRules): string {
  const out: string[] = [];
  for (const k of rules.hide ?? []) out.push(`- ${k}`);
  for (const [k, v] of Object.entries(rules.override ?? {})) out.push(`${k} = ${v}`);
  for (const [k, v] of Object.entries(rules.rename ?? {})) out.push(`~ ${k} = ${v}`);
  for (const [k, v] of Object.entries(rules.blank ?? {})) out.push(`? ${k} = ${v}`);
  let group = "spec";
  for (const a of rules.add ?? []) {
    const g = a.group ?? "spec";
    if (g !== group) {
      out.push(`## ${g}`);
      group = g;
    }
    out.push(`+ ${a.label} = ${a.value}`);
  }
  return out.join("\n");
}

// ── feature blocks ─────────────────────────────────────────────────────────
//
// Blocks separated by a blank line; first line is the title, the rest bullets.

export function parseFeatureBlocks(text: string): FeatureBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) => ({
      title: lines[0],
      bullets: lines.slice(1).map((l) => l.replace(/^[-•*]\s*/, "")),
    }));
}

export function serializeFeatureBlocks(blocks: FeatureBlock[]): string {
  return blocks.map((b) => [b.title, ...b.bullets].join("\n")).join("\n\n");
}

// ── images ─────────────────────────────────────────────────────────────────
//
//   product  https://…/eor100-front.png
//   https://…/eor100-back.png          ← slot defaults to `view`

export function parseImages(text: string): ModelImage[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length >= 2 && !/^https?:|^\//.test(parts[0])) {
        return { slot: parts[0].toLowerCase(), url: parts.slice(1).join(" ") };
      }
      return { slot: "view", url: line };
    })
    .filter((i) => !!i.url);
}

export function serializeImages(images: ModelImage[]): string {
  return images.map((i) => `${i.slot} ${i.url}`).join("\n");
}
