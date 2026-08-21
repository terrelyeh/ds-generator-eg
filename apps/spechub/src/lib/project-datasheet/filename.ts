import type { ProjectDatasheet } from "@eg/db/types";

/**
 * The document title, which is also the filename the browser suggests when
 * somebody chooses "Save as PDF".
 *
 * It had none, so every tender sheet anyone saved arrived in their Downloads
 * as "Product SpecHub — EnGenius" — the root layout's title. Two of those in
 * a folder and nobody can tell which deal they belong to.
 *
 * PRELIMINARY is in the name on purpose. The notice on the cover cannot be
 * switched off (00038), but a PDF gets forwarded, and the thing that survives
 * being forwarded without its cover page is the filename. Somebody opening
 * this six weeks later should not have to read page one to learn the numbers
 * were provisional.
 *
 * The date is the render date, the same one printed in the footer, so a file
 * and the page inside it agree — and so two saves on different days do not
 * silently overwrite each other in a Downloads folder.
 */
export function printTitle(doc: Pick<ProjectDatasheet, "name">, on: Date, issueNo?: number): string {
  const stamp = [on.getFullYear(), on.getMonth() + 1, on.getDate()]
    .map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, "0")))
    .join("-");
  const suffix = issueNo == null ? "" : `_issue-${issueNo}`;
  return `${slug(doc.name)}${suffix}_PRELIMINARY_${stamp}`;
}

/**
 * Filename-safe, without flattening the name to ASCII: a document called
 * 「馬來西亞連鎖便利店」 should keep its name. Only the characters that a file
 * system or a browser would mangle are replaced.
 */
function slug(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, " ")
      // Em dashes and runs of punctuation read as separators, not as words.
      .replace(/[—–]+/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-")
      .slice(0, 120) || "project-datasheet"
  );
}
