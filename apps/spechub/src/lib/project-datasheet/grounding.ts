/**
 * The contract every drafted sentence in a project datasheet is written
 * under, and the spec table it is written against.
 *
 * Shared by the scenario drafter and the cover drafter because it is one
 * rule, and a copy of it in each file would drift — quietly, in the
 * direction of whichever one was edited last, on the document that goes to
 * a customer.
 *
 * ── What it is defending against ────────────────────────────────────────
 * Not a clumsy sentence. A GOOD one. This document carried "a second carrier
 * stands by, protecting payment when one network degrades" — fluent,
 * plausible, and describing automatic failover the supplier never claimed:
 * the source says `2 x SIM card slot` and stops there. It survived several
 * readings because it sounds like something a datasheet would say.
 */

import type { ResolvedRow } from "./types";

/** A drafted line and the spec row it rests on ("" when it rests on none). */
export interface Grounded {
  text: string;
  basis: string;
}

export const GROUNDING_RULES = `THE ONE RULE THAT MATTERS

You may not state any figure, band, standard, rating, port, interface or
capability that is not in the SPEC TABLE below. Not a temperature, not an
ingress rating, not a throughput, not a power figure, not a radio band.

This includes capabilities implied by a spec rather than stated by it. Two SIM
slots are two SIM slots: they are NOT automatic failover, NOT dual-carrier
redundancy, NOT seamless switching, unless a row says so in those words. A
DC input is not battery backup. An Ethernet port is not PoE. If you find
yourself writing what the hardware would let someone build, stop — that is
the customer's design, not our claim.

When what you want to say genuinely needs something the table does not list,
do not soften it into a vaguer sentence that still implies it. Leave it out.

WHICH MODEL

The table gives a value per model. A row that lists a value for only SOME of
the models is a fact about THOSE models and nothing else. A line resting on
such a row must name the model it is true of. Putting "IPsec and WireGuard
VPN support" in a sentence about the indoor unit, when only the outdoor one
lists VPN, is the same error as inventing the spec.

BASIS

Every bullet carries "basis": the exact LABEL of the spec row it rests on,
copied from the table. A bullet resting on more than one row names the most
load-bearing. Where the row is populated for only some models, append them:
"Environment (EOR200)".

A bullet that rests on NO row — how a place is wired, what it costs to dig a
trench, how long a permit takes — uses "". That is expected and often right.
Do NOT reach for a loosely related row to avoid an empty basis: citing
"Description" for a sentence about mounting practice hides the one thing the
reviewer needed to know, which is that a person has to agree with it. An
honest "" is worth more than a stretched label.`;

/**
 * One line per spec row: `Label: EOR100 = x | EOR200 = y`.
 *
 * Per-model rather than collapsed, because the difference between the columns
 * is frequently the whole argument — EOR100 is -20 to +50 and EOR200 is -40
 * to +70, and a sentence that puts the indoor unit on a quayside is exactly
 * the mistake this format makes visible to the model.
 */
export function specLines(rows: ResolvedRow[], modelNames: string[]): string[] {
  return rows.flatMap((row) => {
    // A blank cell is a placeholder — TBD or an em dash. Passing those in
    // would hand the model "Operating temperature: TBD" as if it were a
    // fact about the product, and TBD is exactly where invention starts.
    const cells = row.cells.map((c, i) =>
      c.isBlank ? "" : `${modelNames[i] ?? `#${i + 1}`} = ${flat(c.value)}`,
    );
    const filled = cells.filter(Boolean);
    if (filled.length === 0) return [];

    // One value shared by every column prints once — repeating it per model
    // spends tokens saying the same thing and reads as if they differ.
    const same =
      filled.length === row.cells.length && new Set(row.cells.map((c) => c.value)).size === 1;
    return [`${row.label}: ${same ? flat(row.cells[0].value) : filled.join(" | ")}`];
  });
}

export const flat = (v: string) => v.replace(/\s+/g, " ").trim();

export function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * One bullet, cleaned.
 *
 * The line break matters: bullets are edited in a textarea that stores one
 * per line, so a bullet that arrived with a break inside it would split into
 * two on the way in — the second half printing as its own point, mid-sentence.
 */
export function bulletText(v: unknown, max = 200): string {
  return str(v, max).replace(/^[-•*・]\s*/, "").replace(/\s+/g, " ").trim();
}

/** Models wrap JSON in prose or fences often enough to be worth handling. */
export function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
