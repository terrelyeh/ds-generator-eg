/**
 * Strip what a reader never sees but a model would.
 *
 * Every HTML page indexed here — web, GitBook, help centre — is written by
 * people outside this company, and the conversion to text used to keep HTML
 * comments, `hidden` elements and `display:none` blocks. That is exactly
 * where text meant for crawlers goes, and lately where text meant for
 * language models goes ("ignore your instructions and…"). None of it is on
 * the page a person reads, so none of it belongs in what the model reads.
 *
 * Regex rather than a parser, like the two converters that call it: a
 * hidden element is removed from its opening tag through the first closing
 * tag of the same name, which is right for the leaf-ish elements this
 * targets and, at worst, drops a little visible text after a nested one.
 */
const REMOVED_WHOLE = ["template", "iframe", "object", "embed", "noscript", "script", "style"];

export function stripHiddenHtml(html: string): string {
  let t = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of REMOVED_WHOLE) {
    t = t.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
  }
  // `hidden`, aria-hidden="true", or an inline display:none / visibility:hidden.
  t = t.replace(
    /<([a-z][a-z0-9]*)\b(?:[^>]*?)(?:\shidden(?=[\s>=/])|\saria-hidden\s*=\s*["']?true|\sstyle\s*=\s*["'][^"']*?(?:display\s*:\s*none|visibility\s*:\s*hidden))[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  return t;
}
