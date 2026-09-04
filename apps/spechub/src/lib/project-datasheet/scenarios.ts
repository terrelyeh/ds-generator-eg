import {
  GROUNDING_RULES,
  bulletText,
  extractJson,
  str,
  type Grounded,
} from "./grounding";
import { groundBullets } from "./grounding";

export { specLines } from "./grounding";

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

/**
 * A bullet and the spec row it rests on, or "" for a claim about deployment
 * practice rather than the hardware ("no civil works", "mounts on the
 * existing pole"). Empty is legitimate — it is also the flag that says a
 * human has to agree with this sentence, because nothing in the table will
 * contradict it if it is wrong.
 */
export type ScenarioBullet = Grounded;

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
  /**
   * Basis labels the model wrote that name no row of the table. The bullets
   * stay (their words may be true); their basis is blanked so they read as
   * what they are — a claim resting on nobody — and the invented labels are
   * listed here so the reviewer sees which rows were made up.
   */
  unverifiedBasis: string[];
}

export const SCENARIOS_SYSTEM = `You write the "Application scenarios" copy for an EnGenius PROJECT datasheet
— a preliminary spec sheet used to answer a tender. The reader is a systems
integrator or a procurement officer deciding whether this product fits a site
they already have in mind.

Return ONLY a JSON object:
{"scenarios":[{"heading":"...","lede":"...","bullets":[{"text":"...","basis":"..."}]}],
 "declined":["..."]}

${GROUNDING_RULES}

If a site the sector suggests is unsupportable on the specs, put it in
"declined" with one line saying which spec is missing, rather than writing
it with the missing part left vague.

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
/**
 * Parse the reply, dropping anything malformed.
 *
 * Same strictness as intake and for the same reason: a half-understood draft
 * that looks plausible in a review list is worse than one that never appears.
 * A scenario missing its lede is dropped rather than shown with a blank —
 * because a blank would be filled in by whoever is in a hurry.
 */
export function parseScenarios(raw: string, labels?: string[]): ScenarioProposal {
  const json = extractJson(raw);
  if (!json) return { scenarios: [], declined: [], unverifiedBasis: [] };

  const scenarios: ScenarioDraft[] = [];
  const unverifiedBasis: string[] = [];
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
      const text = bulletText(typeof b === "string" ? b : (b as Record<string, unknown>)?.text);
      if (!text) continue;
      const basis = typeof b === "string" ? "" : str((b as Record<string, unknown>)?.basis, 80);
      bullets.push({ text, basis });
      if (bullets.length === 6) break;
    }

    // Only when the caller has the table: the parser is also used where no
    // rows exist yet, and "no labels" must not read as "every basis is wrong".
    const grounded = labels ? groundBullets(bullets, labels) : { bullets, unverified: [] };
    unverifiedBasis.push(...grounded.unverified);
    scenarios.push({ heading, lede, bullets: grounded.bullets });
  }

  const declined = (Array.isArray(json.declined) ? json.declined : [])
    .map((v) => str(v, 200))
    .filter(Boolean);

  return { scenarios, declined, unverifiedBasis };
}

/** The stored caption is one field; the layout splits it on the em dash. */
export function toCaption(s: ScenarioDraft): string {
  return `${s.heading} — ${s.lede}`;
}
