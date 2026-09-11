/**
 * Which images an answer shows: the ones belonging to sources it actually
 * cited, in the order it cited them.
 *
 * The server sends every retrieved source (up to 12) with its image_urls.
 * Showing all of them would put, say, a different model's screenshot next to
 * an answer that never used that source. The citations are the answer's own
 * statement of what it relied on, so they decide. Pure — no React, no I/O.
 */

export interface FigureSource {
  title: string;
  image_urls?: string[];
}

export interface AnswerFigure {
  url: string;
  /** 1-based citation number, as it appears in the answer. */
  citation: number;
  sourceTitle: string;
}

/** `[2]` and `[1, 3]` — the same shapes the citation renderer accepts. */
const CITATION_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** Citation numbers in order of first appearance. */
export function citedIndexes(content: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const m of content.matchAll(CITATION_RE)) {
    for (const part of m[1].split(",")) {
      const n = parseInt(part.trim(), 10);
      if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/** http(s), or a path on this origin — never `//host`, `data:`, `javascript:`. */
export function isSafeImageUrl(url: string): boolean {
  if (/^\/(?![/\\])/.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function citedFigures(
  content: string,
  sources: FigureSource[] | undefined,
  opts: { max?: number; perSource?: number } = {},
): AnswerFigure[] {
  const { max = 4, perSource = 2 } = opts;
  if (!sources?.length) return [];

  const figures: AnswerFigure[] = [];
  const seenUrls = new Set<string>();
  for (const n of citedIndexes(content)) {
    const src = sources[n - 1];
    if (!src?.image_urls?.length) continue;
    let taken = 0;
    for (const url of src.image_urls) {
      if (figures.length >= max) return figures;
      if (taken >= perSource) break;
      if (seenUrls.has(url) || !isSafeImageUrl(url)) continue;
      seenUrls.add(url);
      figures.push({ url, citation: n, sourceTitle: src.title });
      taken++;
    }
  }
  return figures;
}

/**
 * Did the question ask for something visual? Answer figures stay folded
 * behind「相關圖片（N）」unless it did — four large screenshots under an
 * answer nobody asked to see read as noise. Deliberately a list of explicit
 * asks, not every "圖": 意圖 / 試圖 are not requests for a picture.
 */
const VISUAL_ASK_RE =
  /(架構圖|示意圖|流程圖|拓[樸撲]|截圖|圖片|圖示|附圖|有圖|看圖|給我圖|畫面|長什麼樣|長怎樣|看起來|diagram|image|picture|screenshot|figure|topology|look like)/i;

export function asksForVisuals(question: string | null | undefined): boolean {
  return !!question && VISUAL_ASK_RE.test(question);
}
