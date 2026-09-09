/**
 * Shared text chunker for the manual/uploaded + refined-article RAG pipelines
 * (text snippets, uploaded files, support/vertical-guide articles). Splits
 * markdown into embed-sized chunks, each prefixed with "[label > title]" so
 * retrieval keeps the source context. Mirrors the web pipeline's chunker
 * (lib/rag/ingest-web.ts).
 */

export const MAX_CHUNK_CHARS = 5000;

/**
 * Sections shorter than this are merged into the following section instead of
 * becoming their own chunk. Refined articles use short boilerplate headings
 * ("Symptom", "Root Cause", "Solution"), which previously produced 60–200 token
 * fragments that carry too little context to answer anything on their own.
 * Merging them also yields a better chunk shape for support content: problem
 * and answer end up in the same chunk.
 */
export const MIN_STANDALONE_CHARS = 700;

/**
 * Section headings that describe an article's *structure* rather than its
 * subject. Alone they make useless chunk titles — a citation reading
 * "📎 Symptom" tells the reader nothing, and the title also carries semantic
 * weight at retrieval time. These always get qualified with the article title.
 */
const GENERIC_HEADINGS =
  /^(overview|summary|symptoms?|references?|solutions?(\s*\/\s*actions?\s+taken)?.*|root\s+causes?( analysis)?|conclusions?.*|lessons?\s+learned|deployment\s+details|common\s+customer\s+questions|background|introduction|notes?|details?|steps?|resolution)$/i;

const MAX_TITLE_CHARS = 90;

/** `| --- | :---: |` — the delimiter row that makes a pipe table a table. */
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export interface TextChunk {
  title: string;
  content: string;
}

/**
 * A pipe table is one "paragraph" (rows are single-newline separated), so the
 * paragraph splitter below can't break it and a big table used to go into the
 * index as one oversized chunk — stored whole, but embedded truncated, so its
 * tail was unreachable. Split rows into groups under `budget` chars, repeating
 * the header + delimiter on each so every piece still reads as a table.
 */
function splitTable(paragraph: string, budget: number): string[] {
  const lines = paragraph.split("\n");
  const isTable = lines.length >= 3 && lines[0].trimStart().startsWith("|") && TABLE_SEP_RE.test(lines[1]);
  if (!isTable || paragraph.length <= budget) return [paragraph];

  const header = lines.slice(0, 2).join("\n");
  const groups: string[] = [];
  let rows: string[] = [];
  let size = header.length;
  for (const row of lines.slice(2)) {
    if (rows.length > 0 && size + row.length + 1 > budget) {
      groups.push(`${header}\n${rows.join("\n")}`);
      rows = [];
      size = header.length;
    }
    rows.push(row);
    size += row.length + 1;
  }
  if (rows.length > 0) groups.push(`${header}\n${rows.join("\n")}`);
  return groups;
}

/** Make a section title self-describing: "<article> — <section>". */
function qualifyTitle(articleTitle: string, sectionTitle: string): string {
  const section = sectionTitle.trim();
  const article = articleTitle.trim();
  if (!article || !section || section === article) return section || article;
  // Already mentions the article subject → leave it alone.
  if (section.toLowerCase().includes(article.toLowerCase())) return section;
  // Specific headings ("3. SFP/SFP+ Module Troubleshooting") stand on their own.
  if (!GENERIC_HEADINGS.test(section)) return section;
  return `${article} — ${section}`.slice(0, MAX_TITLE_CHARS);
}

export function chunkText(content: string, title: string, label?: string): TextChunk[] {
  const prefix = `[${label ? label + " > " : ""}${title}]\n\n`;
  const sections = content.split(/\n(?=#{1,3} )/);

  // Pass 1 — drop empties and merge undersized sections forward, so a heading
  // with two sentences under it doesn't become a standalone chunk.
  //
  // ⚠️ Only EMPTY sections are dropped. There used to be a 50-character floor
  // here as well, which silently deleted content this function's whole
  // purpose is to keep: a refined support article opens
  // `## Symptom` / `The AP reboots.` — twenty-seven characters, and the one
  // sentence a person searches for. It never reached the index at all, and
  // the merge machinery below never saw it either. Short sections are
  // undersized, not worthless; that is what merging is for.
  const merged: { title: string; body: string }[] = [];
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    const sectionTitle = headingMatch ? headingMatch[1].replace(/[#*`]/g, "").trim() : title;

    const prev = merged[merged.length - 1];
    if (prev && prev.body.length < MIN_STANDALONE_CHARS) {
      // Keep the earlier heading as the chunk's title — it's the one that
      // introduces the topic; the merged tail elaborates on it.
      prev.body += "\n\n" + trimmed;
    } else {
      merged.push({ title: sectionTitle, body: trimmed });
    }
  }

  // A trailing runt (last section still under the floor) folds back one step.
  if (merged.length > 1) {
    const last = merged[merged.length - 1];
    if (last.body.length < MIN_STANDALONE_CHARS) {
      merged[merged.length - 2].body += "\n\n" + last.body;
      merged.pop();
    }
  }

  // Pass 2 — emit, splitting anything still over the embed ceiling.
  const chunks: TextChunk[] = [];
  for (const { title: sectionTitle, body } of merged) {
    const chunkTitle = qualifyTitle(title, sectionTitle);
    const full = prefix + body;

    if (full.length > MAX_CHUNK_CHARS) {
      // Split the BODY, not `full` — `current` starts as the prefix already,
      // so splitting `full` used to put "[label > title]" into part 1 twice.
      const budget = MAX_CHUNK_CHARS - prefix.length;
      const paragraphs = body.split(/\n\n+/).flatMap((p) => splitTable(p, budget));
      let current = prefix;
      let part = 1;
      for (const para of paragraphs) {
        if (current.length + para.length > MAX_CHUNK_CHARS && current.length > prefix.length) {
          chunks.push({ title: `${chunkTitle} (Part ${part})`, content: current.trim() });
          current = prefix;
          part++;
        }
        current += para + "\n\n";
      }
      if (current.trim().length > prefix.length) {
        chunks.push({
          title: part > 1 ? `${chunkTitle} (Part ${part})` : chunkTitle,
          content: current.trim(),
        });
      }
    } else {
      chunks.push({ title: chunkTitle, content: full });
    }
  }

  // Fallback: short-but-intentional content (e.g. a one-line FAQ snippet) still
  // gets exactly one chunk so it is never silently dropped.
  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push({ title, content: prefix + content.trim() });
  }
  return chunks;
}
