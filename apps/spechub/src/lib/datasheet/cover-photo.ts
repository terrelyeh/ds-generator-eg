/**
 * Everything about the full-bleed cover photograph, in one place.
 *
 * Layouts B (Data Center) and D (Edge AI Box) open on a photograph with the
 * copy laid over its left side and the product render floating right. Three
 * separate things have to agree about that arrangement:
 *
 *   1. the layout component, which draws the scrim
 *   2. the upload checker, which asks whether a photo will survive the scrim
 *   3. whoever writes the next layout that wants a photo
 *
 * When (1) and (2) each carried their own numbers, the checker was a
 * plausible-looking lie the first time anyone touched a gradient. So the
 * gradient string itself lives here and the components import it.
 *
 * ── Why the two layouts have different floors ────────────────────────────
 *
 * Not per-image tuning. The floor is set by the SMALLEST TYPE that sits on
 * the photograph:
 *
 *   B  10pt running copy  → needs 4.5:1, so the scrim holds ~0.74
 *   D  17pt display type  → large text, 3:1 is the bar, ~0.52 is enough
 *
 * B's cover is the only place in any layout where running copy sits on a
 * photograph, and thin small type is what actually fails — that is the whole
 * reason its floor is higher. If B's copy ever moves off the image, its
 * floor should come down with it.
 *
 * ── Why a floor and a release, not a ramp ────────────────────────────────
 *
 * The first scrim eased smoothly across the whole width. That is fine on
 * average and wrong where it matters: the copy column landed on the vertical
 * LED strip of a server rack, where the ramp had already decayed. Holding
 * nearly flat across the copy column and only then falling away survives the
 * NEXT photograph too. A ramp has to be re-tuned per image; a floor does not.
 *
 * ── Why the tint is blue, not black ──────────────────────────────────────
 *
 * Pure black at these opacities reads as a dead grey wash and flattens the
 * photograph into the page. A deep blue keeps the image looking lit, and
 * sits under the teal header band without arguing with it.
 */

/** Scrim tint — deep blue, composited over the photo. */
export const SCRIM_TINT: readonly [number, number, number] = [6, 34, 58];

const rgba = (a: number) => `rgba(${SCRIM_TINT.join(",")},${a})`;

export interface CoverPhotoPolicy {
  /** Human name, for the checker's message. */
  label: string;
  /** The scrim, exactly as the layout draws it. */
  scrim: string;
  /**
   * The scrim's opacity across the text column — the flat part, which is
   * what the checker composites. Reading the gradient string back would be
   * more "correct" and much easier to get subtly wrong.
   */
  textColumnAlpha: number;
  /** Hero box, in pt, for resolving `object-fit: cover`. */
  hero: { w: number; h: number };
  /** The text column within the hero, in hero-local pt. */
  textBox: { x: number; y: number; w: number; h: number };
  /** Smallest type sitting on the photo, and the contrast that size needs. */
  minTypePt: number;
  minContrast: number;
}

export const COVER_PHOTO_POLICIES: Record<string, CoverPhotoPolicy> = {
  /** Layout B — per-model Data Center cover. */
  datacenter: {
    label: "Data Center",
    scrim: `linear-gradient(90deg, ${rgba(0.78)} 0%, ${rgba(0.72)} 42%, ${rgba(0.32)} 68%, ${rgba(0.16)} 100%)`,
    textColumnAlpha: 0.72,
    hero: { w: 612, h: 335 },
    // .hero padding-left 36pt, .hero-copy max-width 272pt; headline through
    // the end of the overview.
    textBox: { x: 36, y: 26, w: 272, h: 289 },
    minTypePt: 10,
    minContrast: 4.5,
  },
  /** Layout D — Edge AI Box series/model cover. */
  edgeAi: {
    label: "Edge AI Box",
    scrim: `linear-gradient(90deg, ${rgba(0.62)} 0%, ${rgba(0.52)} 46%, ${rgba(0.22)} 72%, ${rgba(0.08)} 100%)`,
    textColumnAlpha: 0.52,
    hero: { w: 612, h: 305 },
    // .hero-title at left 36pt / top 76pt / width 410pt, down through
    // .hero-series at top 161pt.
    textBox: { x: 36, y: 76, w: 410, h: 114 },
    minTypePt: 17,
    minContrast: 3.0,
  },
};

/** Which policy a product category prints under, or null if it draws no photo. */
export function policyForCategory(category: string): CoverPhotoPolicy | null {
  if (category === "Edge Network Appliances" || category === "AI Servers") {
    return COVER_PHOTO_POLICIES.datacenter;
  }
  if (category === "Edge AI Computers") return COVER_PHOTO_POLICIES.edgeAi;
  return null;
}

/** Categories whose datasheet opens on a photograph. */
export const COVER_PHOTO_CATEGORIES = new Set([
  "Edge Network Appliances",
  "AI Servers",
  "Edge AI Computers",
]);

/**
 * How many photos a line may keep. Three is enough to compare a shortlist
 * side by side, which is what people actually do, and few enough that the
 * picker stays one row of thumbnails.
 */
export const MAX_COVER_PHOTOS = 3;
