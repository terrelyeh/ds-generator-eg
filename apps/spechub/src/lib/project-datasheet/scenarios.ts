import type { ResolvedRow } from "./types";

/**
 * Application-scenario copy — a general term in, headings and bullets out.
 *
 * What a supplier's spec sheet gives us is a table. What a tender reader
 * wants after the table is four short answers to "where would I put this" —
 * and the supplier never writes those, or writes one line so general it says
 * nothing ("suitable for various industrial applications").
 *
 * ── The failure this is built around ────────────────────────────────────
 * Not a clumsy sentence. A GOOD one. The EOR document carried "a second
 * carrier stands by, protecting payment when one network degrades" — fluent,
 * plausible, and describing automatic failover the supplier never claimed:
 * the source says `2 x SIM card slot` and nothing else. It survived several
 * readings because it sounds like something a datasheet would say. We took
 * it out by hand.
 *
 * So the whole contract here is negative. The model is handed the resolved
 * spec table and forbidden to state any figure, band, rating or capability
 * that is not in it. Every bullet must name the row it leans on, or admit
 * that it leans on none — and the ones that admit it are the ones a reviewer
 * actually needs to read.
 *
 * ── Proposes, never applies ─────────────────────────────────────────────
 * Nothing here writes, not even a draft row. The route is read-only and the
 * panel drops the text into the caption fields, where it still has to be
 * saved by the same button as hand-typed copy. Same posture as intake, and
 * for a stronger reason: this is the prose a customer reads.
 */

export interface ScenarioBullet {
  text: string;
  /**
   * The spec row this bullet rests on, or "" for a claim about deployment
   * practice rather than the hardware ("no civil works", "mounts on the
   * existing pole"). Empty is legitimate — it is also the flag that says a
   * human has to agree with this sentence, because nothing in the table
   * will contradict it if it is wrong.
   */
  basis: string;
}

export interface ScenarioDraft {
  /** short name of the place — prints as the heading */
  heading: string;
  /** ONE complete sentence — prints under the heading */
  lede: string;
  bullets: ScenarioBullet[];
}

export interface ScenarioProposal {
  scenarios: ScenarioDraft[];
  /**
   * Sites the term suggested that the specs do not support — an outdoor
   * scenario for an indoor-only model. Naming them is worth more than
   * silently dropping them: it is the same reasoning that split EOR100 and
   * EOR200 in the first place.
   */
  declined: string[];
}

export const SCENARIOS_SYSTEM = `You write the "Application scenarios" copy for an EnGenius PROJECT datasheet
— a preliminary spec sheet used to answer a tender. The reader is a systems
integrator or a procurement officer deciding whether this product fits a site
they already have in mind.

Return ONLY a JSON object:
{"scenarios":[{"heading":"...","lede":"...","bullets":[{"text":"...","basis":"..."}]}],
 "declined":["..."]}

THE ONE RULE THAT MATTERS

You may not state any figure, band, standard, rating, port, interface or
capability that is not in the SPEC TABLE below. Not a temperature, not an
ingress rating, not a throughput, not a power figure, not a radio band.

This includes capabilities implied by a spec rather than stated by it. Two SIM
slots are two SIM slots: they are NOT automatic failover, NOT dual-carrier
redundancy, NOT seamless switching, unless a row says so in those words. A
DC input is not battery backup. An Ethernet port is not PoE. If you find
yourself writing what the hardware would let someone build, stop — that is
the customer's design, not our claim.

When the site you are describing genuinely needs something the table does not
list, do not soften it into a vaguer sentence that still implies it. Leave it
out, and if that makes the whole scenario unsupportable, put the scenario in
"declined" with one line saying which spec is missing.

WHICH MODEL

The table gives a value per model. A row that lists a value for only SOME of
the models is a fact about THOSE models and nothing else. A bullet resting on
such a row must name the model it is true of. Putting "IPsec and WireGuard
VPN support" in a scenario about the indoor unit, when only the outdoor one
lists VPN, is the same error as inventing the spec.

Where the models differ, each scenario should be about the one that suits
that site. Say which.

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
honest "" is worth more than a stretched label.

WRITING

- heading: 2-4 words naming the PLACE, not the benefit. "Ports and yards",
  "New stores and remodels". Not "Reliable connectivity".
- lede: ONE complete sentence, subject and verb, ending in a full stop. It
  says what is true of that kind of site — the problem, not our product.
- bullets: 2 to 4. Each a short phrase or clause, no full stop, no bullet
  character. Concrete. "Single PoE run carries power and backhaul" beats
  "Flexible installation options".
- Scenarios must differ in KIND of site, not in wording. Four ways of saying
  "somewhere with no fixed line" is one scenario.
- British or American spelling as it comes; do not translate. The datasheet
  is in English.
- Never name a competitor, a carrier, or a customer.

Do not add commentary outside the JSON.`;

export interface ScenarioPromptInput {
  /** what the author typed: "retail", "ports and logistics", "校園" */
  term: string;
  count: number;
  /** headline / series / category / overview, whichever exist */
  doc: { headline?: string | null; seriesName?: string | null; category?: string | null; overview?: string | null };
  modelNames: string[];
  /** the resolved matrix, one line per row, already merged across models */
  specLines: string[];
  /** headings already written, so a second run adds rather than repeats */
  existing: string[];
}

export function buildScenarioPrompt(input: ScenarioPromptInput): string {
  const { term, count, doc, modelNames, specLines, existing } = input;

  const about = [
    doc.headline && `HEADLINE: ${doc.headline}`,
    doc.seriesName && `SERIES: ${doc.seriesName}`,
    doc.category && `CATEGORY: ${doc.category}`,
    doc.overview && `OVERVIEW: ${doc.overview}`,
  ].filter(Boolean);

  return [
    `MODELS: ${modelNames.join(", ") || "(none yet)"}`,
    ...about,
    "",
    "SPEC TABLE — the only facts you may state:",
    ...(specLines.length ? specLines.map((l) => `  ${l}`) : ["  (empty — the document has no spec rows yet)"]),
    "",
    existing.length
      ? `ALREADY WRITTEN (write DIFFERENT sites, do not restate these):\n${existing.map((e) => `  - ${e}`).join("\n")}`
      : "ALREADY WRITTEN: none.",
    "",
    `THE SECTOR: ${term.trim()}`,
    `Write ${count} scenarios within it. Different kinds of site, not different wordings.`,
  ].join("\n");
}

/**
 * One line per spec row: `Label: EOR100 = x | EOR200 = y`.
 *
 * Per-model rather than collapsed, because the difference between the columns
 * is frequently the whole argument — EOR100 is -20 to +50 and EOR200 is -40
 * to +70, and a scenario that puts the indoor unit on a quayside is exactly
 * the mistake this format makes visible to the model.
 */
export function specLines(rows: ResolvedRow[], modelNames: string[]): string[] {
  return rows.flatMap((row) => {
    // A blank cell is a placeholder — TBD or an em dash. Passing those in
    // would hand the model "Operating temperature: TBD" as if it were a
    // fact about the site, and TBD is exactly where invention starts.
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

const flat = (v: string) => v.replace(/\s+/g, " ").trim();

/**
 * Parse the reply, dropping anything malformed.
 *
 * Same strictness as intake and for the same reason: a half-understood draft
 * that looks plausible in a review list is worse than one that never appears.
 * A scenario missing its lede is dropped rather than shown with a blank —
 * because a blank would be filled in by whoever is in a hurry.
 */
export function parseScenarios(raw: string): ScenarioProposal {
  const json = extractJson(raw);
  if (!json) return { scenarios: [], declined: [] };

  const scenarios: ScenarioDraft[] = [];
  for (const entry of Array.isArray(json.scenarios) ? json.scenarios : []) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const heading = str(e.heading, 60);
    const lede = str(e.lede, 240);
    if (!heading || !lede) continue;

    const bullets: ScenarioBullet[] = [];
    for (const b of Array.isArray(e.bullets) ? e.bullets : []) {
      // Accept a bare string too. The instruction asks for objects, and one
      // run in five returns strings anyway; dropping those would show three
      // bullets where the model wrote four and look like OUR bug.
      const text = typeof b === "string" ? str(b, 200) : str((b as Record<string, unknown>)?.text, 200);
      if (!text) continue;
      const basis = typeof b === "string" ? "" : str((b as Record<string, unknown>)?.basis, 80);
      // The textarea stores one bullet per line, so a bullet that arrived
      // with a line break inside it would split into two on the way in — the
      // second half printing as its own point, mid-sentence.
      const clean = text.replace(/^[-•*・]\s*/, "").replace(/\s+/g, " ").trim();
      if (!clean) continue;
      bullets.push({ text: clean, basis });
      if (bullets.length === 6) break;
    }

    scenarios.push({ heading, lede, bullets });
  }

  const declined = (Array.isArray(json.declined) ? json.declined : [])
    .map((v) => str(v, 200))
    .filter(Boolean);

  return { scenarios, declined };
}

/** The stored caption is one field; the layout splits it on the em dash. */
export function toCaption(s: ScenarioDraft): string {
  return `${s.heading} — ${s.lede}`;
}

// ── helpers ────────────────────────────────────────────────────────────────

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Models wrap JSON in prose or fences often enough to be worth handling. */
function extractJson(raw: string): Record<string, unknown> | null {
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
