/**
 * Prepares one markdown file from an INTERNAL DOCUMENT PACKAGE — a folder of
 * `.md` files exported from a project repo (an SRS, a PRD, a design-doc
 * bundle) — for the shared refined-article ingest (`ingest-refined.ts`).
 *
 * Pure functions, no I/O. What it does to a file:
 *   - path → stable, path-shaped source id (`…/skills/networks/SKILL.md` →
 *     `…/skills/networks`), so re-ingesting a new version of the package is a
 *     clean replace per file and the version lives in metadata, not the id.
 *   - `SKILL.md` files (agent skill definitions) are reduced to their
 *     frontmatter + prose: the `## API Operations` endpoint tables, the CLI
 *     `## Quick Reference`, and the "load X before responding — MANDATORY"
 *     loader blocks are dropped. Those are runtime plumbing for the agent that
 *     runs the skill, not knowledge about what the skill does — and the loader
 *     text is literally an instruction, which is not something to hand a
 *     different model inside a `<source>` block.
 *   - images become their alt text (package diagrams carry descriptive alts),
 *     relative links / anchors become plain text (they can't resolve from a
 *     chunk anyway), HTML anchors and comments go.
 */

export interface InternalDocInput {
  /** Path relative to the package root, e.g. `references/01-shared-product-contracts/house-rules.md`. */
  relPath: string;
  markdown: string;
}

export interface PreparedDoc {
  /** Path-shaped id relative to the package root (no collection prefix, no `.md`). */
  sourceId: string;
  title: string;
  /** Cleaned markdown, frontmatter stripped; skills get a synthesized H1 + description. */
  markdown: string;
  meta: Record<string, unknown>;
  /** Headings of the sections removed (skills only) — shown in dry-run output. */
  dropped: string[];
}

/** H2 sections of a SKILL.md that are runtime plumbing, not product knowledge. */
export const DROPPED_SKILL_SECTIONS: RegExp[] = [
  /^API Operations$/i,
  /^Quick Reference$/i,
  /MANDATORY/i,
];

const FENCE_RE = /^\s*(```|~~~)/;

/**
 * Frontmatter parser that understands the skill format: top-level scalars plus
 * `key: >` / `key: |` block scalars whose continuation lines are indented.
 * (ingest-refined's own parser only reads scalars — a folded `description: >`
 * would come back as ">".)
 */
export function parseDocFrontmatter(md: string): { fm: Record<string, string>; body: string } {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { fm: {}, body: md };
  const fm: Record<string, string> = {};
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const mm = lines[i].match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!mm) continue;
    const key = mm[1];
    const raw = mm[2].trim();
    const block = raw.match(/^([>|])-?$/);
    if (block) {
      const parts: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === "")) {
        i++;
        if (lines[i].trim() === "") {
          if (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push("");
          continue;
        }
        parts.push(lines[i].trim());
      }
      fm[key] = block[1] === ">" ? parts.join(" ").replace(/\s+/g, " ").trim() : parts.join("\n").trim();
    } else if (raw) {
      fm[key] = raw.replace(/^["']|["']$/g, "");
    }
  }
  return { fm, body: md.slice(m[0].length) };
}

/** Remove H2 sections whose heading matches; a section runs to the next H1/H2 outside a code fence. */
export function stripSections(body: string, drop: RegExp[]): { body: string; dropped: string[] } {
  const out: string[] = [];
  const dropped: string[] = [];
  let inFence = false;
  let skipping = false;
  for (const line of body.split("\n")) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      if (!skipping) out.push(line);
      continue;
    }
    if (!inFence) {
      const h = line.match(/^(#{1,2})\s+(.+?)\s*$/);
      if (h) {
        const heading = h[2].replace(/[*`]/g, "").trim();
        if (h[1].length === 2 && drop.some((re) => re.test(heading))) {
          skipping = true;
          dropped.push(heading);
          continue;
        }
        skipping = false;
      }
    }
    if (!skipping) out.push(line);
  }
  return { body: out.join("\n"), dropped };
}

/** First heading of the given level outside code fences. */
function firstHeading(body: string, level: number): string | null {
  let inFence = false;
  const re = new RegExp(`^#{${level}}\\s+(.+?)\\s*$`);
  for (const line of body.split("\n")) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = line.match(re);
    if (h) return h[1].replace(/[*`]/g, "").trim();
  }
  return null;
}

/** Images → alt text, relative links/anchors → link text, HTML anchors + comments → gone. */
export function cleanMarkdown(body: string): string {
  return (
    body
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<a\s+(?:id|name)="[^"]*"\s*><\/a>/g, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) => (alt.trim() ? `（圖：${alt.trim()}）` : ""))
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text: string, target: string) =>
        /^(https?:|mailto:)/i.test(target.trim()) ? m : text,
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** `references/x/skills/networks/SKILL.md` → `references/x/skills/networks`. */
export function toDocSourceId(relPath: string): string {
  let id = relPath.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\.md$/i, "");
  if (/(^|\/)SKILL$/.test(id)) id = id.replace(/(^|\/)SKILL$/, "");
  return id.replace(/[^A-Za-z0-9._/-]+/g, "-") || "doc";
}

function humanize(relPath: string): string {
  const base = relPath.split("/").pop() ?? relPath;
  return base.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
}

export function prepareInternalDoc(input: InternalDocInput): PreparedDoc {
  const relPath = input.relPath.replace(/\\/g, "/").replace(/^\.?\//, "");
  const { fm, body: rawBody } = parseDocFrontmatter(input.markdown);
  const isSkill = /(^|\/)SKILL\.md$/i.test(relPath) || (!!fm.name && !!fm.description && !firstHeading(rawBody, 1));
  const sourceId = toDocSourceId(relPath);

  if (isSkill) {
    const name = fm.name || sourceId.split("/").pop() || sourceId;
    const { body, dropped } = stripSections(rawBody, DROPPED_SKILL_SECTIONS);
    const head = `# Skill: ${name}\n\n${fm.description ?? ""}`.trim();
    const meta: Record<string, unknown> = { path: relPath, doc_kind: "skill", skill: name };
    if (fm.category) meta.skill_category = fm.category;
    if (fm.origin) meta.skill_origin = fm.origin;
    return {
      sourceId,
      title: `Skill: ${name}`,
      markdown: `${head}\n\n${cleanMarkdown(body)}`.trim(),
      meta,
      dropped,
    };
  }

  const title = firstHeading(rawBody, 1) || fm.title || humanize(relPath);
  return {
    sourceId,
    title,
    markdown: cleanMarkdown(rawBody),
    meta: { path: relPath, doc_kind: "doc" },
    dropped: [],
  };
}
