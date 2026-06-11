/**
 * Shared text chunker for the manual/uploaded RAG pipelines (text snippets,
 * uploaded files). Splits markdown/plain text into embed-sized chunks, each
 * prefixed with "[label > title]" so retrieval keeps the source context.
 * Mirrors the web pipeline's chunker (lib/rag/ingest-web.ts).
 */

export const MAX_CHUNK_CHARS = 5000;
export const MIN_CHUNK_CHARS = 50;

export interface TextChunk {
  title: string;
  content: string;
}

export function chunkText(content: string, title: string, label?: string): TextChunk[] {
  const prefix = `[${label ? label + " > " : ""}${title}]\n\n`;
  const sections = content.split(/\n(?=#{1,3} )/);
  const chunks: TextChunk[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < MIN_CHUNK_CHARS) continue;

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    const sectionTitle = headingMatch ? headingMatch[1].replace(/[#*`]/g, "").trim() : title;
    const full = prefix + trimmed;

    if (full.length > MAX_CHUNK_CHARS) {
      const paragraphs = full.split(/\n\n+/);
      let current = prefix;
      let part = 1;
      for (const para of paragraphs) {
        if (current.length + para.length > MAX_CHUNK_CHARS && current.length > prefix.length) {
          chunks.push({ title: `${sectionTitle} (Part ${part})`, content: current.trim() });
          current = prefix;
          part++;
        }
        current += para + "\n\n";
      }
      if (current.trim().length > prefix.length) {
        chunks.push({ title: part > 1 ? `${sectionTitle} (Part ${part})` : sectionTitle, content: current.trim() });
      }
    } else {
      chunks.push({ title: sectionTitle, content: full });
    }
  }

  // Fallback: short-but-intentional content (e.g. a one-line FAQ snippet) still
  // gets exactly one chunk so it is never silently dropped.
  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push({ title, content: prefix + content.trim() });
  }
  return chunks;
}
