/**
 * The Features & Benefits bullet, drawn in CSS instead of typed as a glyph.
 *
 * Every layout used to render a bullet CHARACTER, which quietly made the
 * dot's size a property of whichever font the locale resolved to rather
 * than of the design. U+25CF is full-width and solid in the CJK faces but
 * small and light in Roboto, so identical CSS printed very different dots
 * (measured ink diameter, Chrome):
 *
 *   A standard  zh-TW  U+25CF  6pt  Noto Sans TC          5.40pt
 *   A standard  ja     U+25CF  6pt  Zen Kaku Gothic New   5.28pt
 *   A standard  en/es  U+25CF  6pt  Roboto                2.58pt  ← 48%
 *   B DataCenter       U+25CF  8.5pt Roboto               3.66pt
 *   C Broadband        U+2022  7.5pt Roboto               1.49pt
 *   D Edge AI          U+2022  8pt   Roboto               1.59pt
 *
 * A CSS circle is font-independent, so the four layouts render the same dot
 * and it stays put if anyone changes the face later.
 */

/**
 * Dot diameter as a fraction of the bullet row's own type size.
 *
 * The CJK rendering is the one the printed sheets were signed off on: a
 * 5.3-5.4pt dot beside 10.5-11pt copy, i.e. very close to half the type
 * size. Expressing it in `em` rather than pt keeps that proportion in
 * layouts whose feature copy is smaller (Broadband sets 7.5pt, Edge AI
 * 8pt), and lets the standard layout follow `features_size` when someone
 * edits it in Settings ▸ Typography.
 */
export const BULLET_EM = 0.5;

/**
 * CSS for a bullet dot.
 *
 * `selector` is the dot element; it must be a flex child of the row. The
 * row needs `align-items: baseline` — an empty box's baseline is its bottom
 * margin edge, which drops the circle onto the text baseline spanning
 * roughly the x-height, matching where the glyph used to sit.
 *
 * `color` defaults to `currentColor` so the dot tracks the row's text
 * colour; pass an explicit value only where the design calls for a dot in
 * an accent colour (the Data Center cover does).
 */
export function bulletDotCss(selector: string, color = "currentColor"): string {
  return `${selector} {
  flex: none;
  width: ${BULLET_EM}em;
  height: ${BULLET_EM}em;
  border-radius: 50%;
  background: ${color};
}`;
}
