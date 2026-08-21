import { PT } from "@/lib/datasheet/scale";

/**
 * The printed geometry of an on-image label, in one place.
 *
 * The renderer draws these and the editor previews them, and the two have
 * drifted twice: first the offset (9px in the editor against 7pt on the
 * page), then the type size (10px against 8pt). Both times the editor looked
 * right and the PDF did not, and both times the cause was the same two
 * numbers living in two files.
 */

/**
 * A step below the spec table.
 *
 * `table` put the labels at the same weight as the scenario headings beside
 * them, which read as a competing voice rather than an annotation — the words
 * on a picture should be quieter than the words about it.
 */
export const LABEL_PT = PT.tableSm;

/** Marker dot diameter. */
export const LABEL_DOT_PT = 3;

/**
 * Width a scenario illustration prints at: 58% of the 524pt content column.
 *
 * The editor scales its labels by the picture's rendered width over this, so
 * a label covers the same fraction of the picture in both places. The page 2
 * hero prints wider, so its labels come out slightly smaller than the editor
 * shows — erring toward more clearance, which is the safe direction.
 */
export const SCENARIO_WIDTH_PT = 304;
