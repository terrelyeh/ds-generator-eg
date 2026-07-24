/**
 * Which product lines print a "Contact Us" QR instead of a QSG link, and
 * which carry a second hardware render.
 *
 * These are category-driven datasheet traits. They lived as ad-hoc
 * `category === "Transceivers"` checks in each component, which is how the
 * product page ended up advertising a QSG short URL for Data Center models
 * while their datasheet actually printed Contact Us. Keep the predicates
 * here so every surface agrees.
 */

/** EnGenius global Contact Us page (hyphen — the `contact_us` form 404s). */
export const CONTACT_US_URL = "https://www.engeniustech.com/contact-us";

/** Lines with no Quick Start Guide — the datasheet QR points at Contact Us. */
const CONTACT_US_CATEGORIES = new Set([
  "Transceivers",
  "Edge Network Appliances",
  "AI Servers",
]);

/** Lines whose Hardware Overview page shows two renders (front + rear). */
const TWO_HARDWARE_IMAGE_CATEGORIES = new Set([
  "Edge Network Appliances",
  "AI Servers",
]);

/**
 * Lines whose datasheet is drawn by its OWN component, not the Cloud
 * template — so the Cloud cover's capacity model (a fixed-height two-column
 * features box) says nothing about them.
 *
 * EOC620 was flagged "12 items, cut 4" while its page-2 box holds 12
 * comfortably; the Broadband and Data Center layouts simply have different
 * room. Keep the layout checker off them rather than inventing thresholds
 * for each one.
 */
const OWN_LAYOUT_CATEGORIES = new Set([
  "Broadband APs",
  "Edge Network Appliances",
  "AI Servers",
  "Edge AI Computers",
]);

/** True when the line's datasheet cover is the Cloud template's. */
export function usesCloudCoverLayout(category: string | null | undefined): boolean {
  return !category || !OWN_LAYOUT_CATEGORIES.has(category);
}

export function usesContactUsQr(category: string | null | undefined): boolean {
  return !!category && CONTACT_US_CATEGORIES.has(category);
}

export function usesTwoHardwareImages(category: string | null | undefined): boolean {
  return !!category && TWO_HARDWARE_IMAGE_CATEGORIES.has(category);
}
