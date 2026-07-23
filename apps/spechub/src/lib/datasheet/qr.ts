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

export function usesContactUsQr(category: string | null | undefined): boolean {
  return !!category && CONTACT_US_CATEGORIES.has(category);
}

export function usesTwoHardwareImages(category: string | null | undefined): boolean {
  return !!category && TWO_HARDWARE_IMAGE_CATEGORIES.has(category);
}
