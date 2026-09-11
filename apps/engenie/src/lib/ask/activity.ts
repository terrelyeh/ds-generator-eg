/**
 * Shaping the retrieved sources for an answer's activity line — the live
 * "what did it find" trace while waiting, and the collapsible list above the
 * answer afterwards. Pure; components/chat/answer-activity.tsx renders it.
 */

export interface ActivitySource {
  title: string;
  source_id: string;
  source_type: string;
  source_url: string | null;
}

export interface SourceGroup {
  key: string;
  title: string;
  sourceType: string;
  url: string | null;
  /** 1-based citation numbers that point into this item — the answer's [n]. */
  citations: number[];
}

/**
 * Collapse retrieved chunks into what a reader would call one item: same
 * source, same section title. Twelve chunks are often three sections of one
 * document; listing them twelve times reads as padding. Different sections of
 * the same document stay separate — "4.4 Memory" and "4.5 Change Ticket" are
 * two things the answer drew on.
 */
export function groupSources(sources: ActivitySource[] | undefined): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  (sources ?? []).forEach((s, i) => {
    const key = `${s.source_type}:${s.source_id}:${s.title}`;
    const existing = groups.get(key);
    if (existing) {
      existing.citations.push(i + 1);
      return;
    }
    groups.set(key, {
      key,
      title: s.title || s.source_id,
      sourceType: s.source_type,
      url: s.source_url,
      citations: [i + 1],
    });
  });
  return [...groups.values()];
}

/**
 * Where a source's title may link. External http(s) always. Paths on this app
 * only where the reader has an EnGenie login — the internal Ask. Workspace,
 * widget and extension readers hold a workspace token, not a session, so
 * /knowledge/doc would bounce them to sign-in. product_spec's "/product/…" is
 * a SpecHub page, never ours.
 */
export function sourceHref(
  url: string | null,
  sourceType: string,
  opts: { allowRelative: boolean },
): string | null {
  if (!url || sourceType === "product_spec") return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (opts.allowRelative && /^\/(?![/\\])/.test(url)) return url;
  return null;
}
