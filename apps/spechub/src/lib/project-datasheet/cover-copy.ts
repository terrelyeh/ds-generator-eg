/**
 * Cover copy — headline, category, Overview and Features & Benefits, drafted
 * from the document's own spec table.
 *
 * This is the OTHER path's answer to the same problem the scenario drafter
 * solves. Seeding from a catalogue model now carries our own approved English
 * across, so that path needs no model at all. A document built from an ODM
 * spec sheet has no EnGenius copy to carry: the supplier's overview is a
 * paragraph of chipset and band lists, and page one goes out blank unless
 * somebody writes two paragraphs of marketing prose at the end of the day.
 *
 * Which makes this the most over-claim-prone text in the whole document —
 * the cover is the one page written to persuade — so it runs under the same
 * negative contract as everything else here, from `grounding.ts`.
 *
 * ── Deliberately NOT given the source text ──────────────────────────────
 * The gap scanner reads the supplier's prose, because catching "the source
 * says IP66 and you wrote IP67" needs it. Drafting is the opposite job.
 * Handing over a paragraph that says "the waterproof level is up to IP66"
 * when the table lists no ingress rating at all invites the model to launder
 * a supplier's marketing into ours — in our voice, on our letterhead, over
 * our signature. The resolved table already carries a Description row saying
 * what the product is. That is enough to write from and nothing more.
 */

import {
  GROUNDING_RULES,
  bulletText,
  extractJson,
  str,
  type Grounded,
} from "./grounding";
import { groundBullets } from "./grounding";

export interface CoverFeatureBlock {
  title: string;
  bullets: Grounded[];
}

export interface CoverDraft {
  headline: string;
  categoryLabel: string;
  overview: string;
  features: CoverFeatureBlock[];
  /** heading beside the page-2 architecture diagram */
  diagramTitle: string;
  /** the paragraph under it — how the unit sits in a site */
  diagramNote: string;
  /** claims the sector expects that the table cannot support */
  declined: string[];
  /** basis labels that name no row — see ScenarioProposal.unverifiedBasis */
  unverifiedBasis: string[];
}

export const COVER_SYSTEM = `You write the COVER copy for an EnGenius PROJECT datasheet — a preliminary
spec sheet used to answer a tender. Page one is read by a procurement officer
deciding whether to keep reading. It has to say what this product is and why
it suits the job, without claiming anything we cannot stand behind.

Return ONLY a JSON object:
{"headline":"...","categoryLabel":"...","overview":"...",
 "features":[{"title":"...","bullets":[{"text":"...","basis":"..."}]}],
 "diagramTitle":"...","diagramNote":"...","declined":["..."]}

${GROUNDING_RULES}

Anything a document like this would normally claim but the table cannot
support goes in "declined", one line each, saying which spec is missing.
That list is the useful half of the answer — it tells a person what to go
and ask the supplier for.

WRITING

- headline: what the product IS, in the words a buyer would use. 3-7 words,
  Title Case, no full stop. "Outdoor 4G / 5G Cellular Routers". NOT a slogan,
  NOT a benefit, NOT a sentence. If the models differ in a way the buyer
  chooses on, the headline may carry both ("Indoor and Outdoor").
- categoryLabel: 1-3 words naming the device class, e.g. "Cellular Router".
  It prints in small capitals; write it in normal case.
- overview: TWO short paragraphs separated by a blank line, UNDER 500
  CHARACTERS IN TOTAL — a longer one overflows the cover box and is cut off
  in the PDF. First paragraph: what it is and what problem it addresses.
  Second: what is distinctive here, drawn from the table. Plain declarative
  English. No superlatives, no "cutting-edge", no "seamlessly".
- features: 3 or 4 blocks. Each title is a BENEFIT in 3-6 words, not a spec
  name — "Deploy without a fixed line", not "Cellular WAN". Each block has
  1 or 2 bullets, each ONE complete sentence ending in a full stop, saying
  what the spec lets the reader do.
- diagramTitle: 2-3 words naming what the picture shows, Title Case.
  "System architecture". No full stop.
- diagramNote: 2 to 4 sentences, UNDER 420 CHARACTERS, printed beside that
  picture. It describes HOW ONE SITE IS PUT TOGETHER — where the unit
  mounts, what one cable carries, what hangs off it downstream — not what
  the product is (the Overview already said that). You cannot see the
  picture, so write what is true of the deployment, never "as shown" or
  "on the left". Downstream equipment is the customer's, so name it in
  general terms (cameras, payment terminals, indoor wireless) and claim
  nothing about it.
- Where the models differ, say which model. A cover that reads as one
  product when it is two is the error this document is most prone to.
- British or American spelling as it comes; do not translate. The datasheet
  is in English.
- Never name a competitor, a carrier, or a customer.

Do not add commentary outside the JSON.`;

export interface CoverPromptInput {
  modelNames: string[];
  /** the resolved matrix, one line per row, already merged across models */
  specLines: string[];
  /** whatever cover fields are already written, so a draft can respect them */
  existing: {
    headline?: string | null;
    categoryLabel?: string | null;
    overview?: string | null;
    diagramNote?: string | null;
  };
  /** optional steer from the author: "強調免施工、戶外" */
  hint: string;
}

export function buildCoverPrompt({
  modelNames,
  specLines,
  existing,
  hint,
}: CoverPromptInput): string {
  const written = [
    existing.headline?.trim() && `HEADLINE: ${existing.headline.trim()}`,
    existing.categoryLabel?.trim() && `CATEGORY: ${existing.categoryLabel.trim()}`,
    existing.overview?.trim() && `OVERVIEW: ${existing.overview.trim()}`,
    existing.diagramNote?.trim() && `DIAGRAM NOTE: ${existing.diagramNote.trim()}`,
  ].filter(Boolean);

  return [
    `MODELS: ${modelNames.join(", ") || "(none yet)"}`,
    "",
    "SPEC TABLE — the only facts you may state:",
    ...(specLines.length
      ? specLines.map((l) => `  ${l}`)
      : ["  (empty — the document has no spec rows yet)"]),
    "",
    // Not "leave these alone": a second run is usually a request for a better
    // version of exactly the field somebody is unhappy with. What the copy
    // must not do is contradict what is already on the page.
    written.length
      ? `ALREADY ON THE COVER (yours must be consistent with these, and better):\n${written.join("\n")}`
      : "ALREADY ON THE COVER: nothing.",
    "",
    hint.trim() ? `WHAT THIS TENDER CARES ABOUT: ${hint.trim()}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Parse the reply, dropping anything malformed.
 *
 * Fields are independent: a bad `features` array must not cost you the
 * overview, because these are applied one at a time and a person who wanted
 * the overview should get it.
 */
export function parseCover(raw: string, labels?: string[]): CoverDraft | null {
  const json = extractJson(raw);
  if (!json) return null;

  const features: CoverFeatureBlock[] = [];
  const unverifiedBasis: string[] = [];
  for (const entry of Array.isArray(json.features) ? json.features : []) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = str(e.title, 80);
    if (!title) continue;

    const bullets: Grounded[] = [];
    for (const b of Array.isArray(e.bullets) ? e.bullets : []) {
      const text = bulletText(typeof b === "string" ? b : (b as Record<string, unknown>)?.text, 320);
      if (!text) continue;
      const basis = typeof b === "string" ? "" : str((b as Record<string, unknown>)?.basis, 80);
      bullets.push({ text, basis });
      if (bullets.length === 3) break;
    }
    const grounded = labels ? groundBullets(bullets, labels) : { bullets, unverified: [] };
    unverifiedBasis.push(...grounded.unverified);
    features.push({ title, bullets: grounded.bullets });
    if (features.length === 6) break;
  }

  const draft: CoverDraft = {
    headline: str(json.headline, 120),
    categoryLabel: str(json.categoryLabel, 40),
    // Paragraph breaks survive; runs of blank lines do not, because the cover
    // box is fixed and an accidental third gap costs a line of copy.
    overview: str(json.overview, 900).replace(/\n{3,}/g, "\n\n"),
    features,
    diagramTitle: str(json.diagramTitle, 60),
    // One paragraph. The layout sets it as a single block beside the
    // picture, so a line break here just prints as a gap in a column.
    diagramNote: str(json.diagramNote, 700).replace(/\s+/g, " "),
    declined: (Array.isArray(json.declined) ? json.declined : [])
      .map((v) => str(v, 200))
      .filter(Boolean),
    unverifiedBasis,
  };

  const empty =
    !draft.headline &&
    !draft.categoryLabel &&
    !draft.overview &&
    !draft.diagramNote &&
    draft.features.length === 0;
  return empty ? null : draft;
}

/** The editor holds the blocks as text: title line, then one bullet a line. */
export function serializeFeatures(blocks: CoverFeatureBlock[]): string {
  return blocks
    .map((b) => [b.title, ...b.bullets.map((x) => x.text)].join("\n"))
    .join("\n\n");
}
