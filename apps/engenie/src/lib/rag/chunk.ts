/**
 * Shared text chunker for the manual/uploaded + refined-article RAG pipelines
 * (text snippets, uploaded files, support/vertical-guide articles). Splits
 * markdown into embed-sized chunks, each prefixed with "[label > title]" so
 * retrieval keeps the source context. Mirrors the web pipeline's chunker
 * (lib/rag/ingest-web.ts).
 */

export const MAX_CHUNK_CHARS = 5000;
export const MIN_CHUNK_CHARS = 50;

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

export interface TextChunk {
  title: string;
  content: string;
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
  const merged: { title: string; body: string }[] = [];
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < MIN_CHUNK_CHARS) continue;

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
      const paragraphs = full.split(/\n\n+/);
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
