import { describe, expect, it } from "vitest";
import {
  cleanMarkdown,
  parseDocFrontmatter,
  prepareInternalDoc,
  stripSections,
  toDocSourceId,
} from "./internal-doc-prep";

const SKILL = `---
name: networks
origin: self-built
category: capability
description: >
  Read one network's configuration (identity, general settings, SSID profiles),
  and make confirmed T1 changes. Use when the user wants to inspect a network.

---

## Persona & Output Rules — MANDATORY

Load \`../../references/network-admin-persona.md\` before your first response.

# Network General Settings Plus Management

Use this skill to **read** one network's configuration.

## Quick Reference

| Task | How |
|------|-----|
| Call any API operation | \`python3 scripts/call_api.py --operation-id X\` |

### Example

\`\`\`bash
# GET — read current general policy plus
python3 scripts/call_api.py --operation-id get_general_policy_plus
\`\`\`

## API Operations

### get_general_policy_plus

- method: GET
- path: /orgs/{orgId}/networks/{networkId}/policy

## Flow Modules (Execution Order)

F0 resolve scope, F1 read, F2 propose.

## Constraints (Hard Rules)

Never write without a confirmed ticket item.
`;

describe("parseDocFrontmatter", () => {
  it("reads folded block scalars, not just one-line values", () => {
    const { fm, body } = parseDocFrontmatter(SKILL);
    expect(fm.name).toBe("networks");
    expect(fm.category).toBe("capability");
    expect(fm.description).toBe(
      "Read one network's configuration (identity, general settings, SSID profiles), and make confirmed T1 changes. Use when the user wants to inspect a network.",
    );
    expect(body.startsWith("## Persona")).toBe(true);
  });

  it("passes markdown without frontmatter through untouched", () => {
    const { fm, body } = parseDocFrontmatter("# Title\n\nbody");
    expect(fm).toEqual({});
    expect(body).toBe("# Title\n\nbody");
  });
});

describe("stripSections", () => {
  it("drops a matching H2 section up to the next H1/H2", () => {
    const { body, dropped } = stripSections(SKILL, [/^API Operations$/]);
    expect(dropped).toEqual(["API Operations"]);
    expect(body).not.toContain("get_general_policy_plus\n\n- method");
    expect(body).toContain("## Flow Modules (Execution Order)");
    expect(body).toContain("## Quick Reference");
  });

  it("ignores '# comment' lines inside code fences", () => {
    // The bash example under Quick Reference has a `# GET — …` comment: it must
    // neither end the section early nor be mistaken for a heading.
    const { body } = stripSections(SKILL, [/^Quick Reference$/]);
    expect(body).not.toContain("# GET — read current general policy plus");
    expect(body).not.toContain("call_api.py --operation-id get_general_policy_plus\n```");
    expect(body).toContain("## API Operations");
  });
});

describe("cleanMarkdown", () => {
  it("keeps image alt text, strips relative links, keeps http links", () => {
    const md = [
      "![Craft AI 產品架構全貌](diagrams/stack.svg)",
      "![](diagrams/blank.png)",
      "See [Memory Contract §9](references/memory.md#s9) and [Annex E](#open-items).",
      "Source: [repository](https://github.com/x/y).",
      '<a id="open-items"></a>',
      "<!-- src: notes -->",
    ].join("\n\n");
    const out = cleanMarkdown(md);
    expect(out).toContain("（圖：Craft AI 產品架構全貌）");
    expect(out).not.toContain("blank.png");
    expect(out).toContain("See Memory Contract §9 and Annex E.");
    expect(out).toContain("[repository](https://github.com/x/y)");
    expect(out).not.toContain('<a id=');
    expect(out).not.toContain("<!--");
  });
});

describe("toDocSourceId", () => {
  it("is path-shaped, drops .md, and folds SKILL.md into its folder", () => {
    expect(toDocSourceId("Craft-AI-SRS-v2.0.md")).toBe("Craft-AI-SRS-v2.0");
    expect(toDocSourceId("references/02-capability-skills/skills/networks/SKILL.md")).toBe(
      "references/02-capability-skills/skills/networks",
    );
    expect(toDocSourceId("./references/03/widget-library/index.md")).toBe("references/03/widget-library/index");
  });
});

describe("prepareInternalDoc", () => {
  it("reduces a SKILL.md to frontmatter + prose under a synthesized heading", () => {
    const doc = prepareInternalDoc({ relPath: "references/02/skills/networks/SKILL.md", markdown: SKILL });
    expect(doc.sourceId).toBe("references/02/skills/networks");
    expect(doc.title).toBe("Skill: networks");
    expect(doc.markdown.startsWith("# Skill: networks\n\nRead one network's configuration")).toBe(true);
    expect(doc.dropped).toEqual(["Persona & Output Rules — MANDATORY", "Quick Reference", "API Operations"]);
    expect(doc.markdown).not.toContain("Load `../../references/network-admin-persona.md`");
    expect(doc.markdown).not.toContain("call_api.py");
    expect(doc.markdown).not.toContain("- method: GET");
    expect(doc.markdown).toContain("## Flow Modules (Execution Order)");
    expect(doc.markdown).toContain("Never write without a confirmed ticket item.");
    expect(doc.meta).toEqual({
      path: "references/02/skills/networks/SKILL.md",
      doc_kind: "skill",
      skill: "networks",
      skill_category: "capability",
      skill_origin: "self-built",
    });
  });

  it("strips heading emphasis and code marks but keeps identifiers intact", () => {
    const doc = prepareInternalDoc({ relPath: "widgets/widget_kpi_grid.md", markdown: "# Widget: `kpi_grid`\n\nbody" });
    expect(doc.title).toBe("Widget: kpi_grid");
  });

  it("titles a plain document by its H1 and leaves its sections alone", () => {
    const md = "# EnGenius Craft AI — House Rules Contract\n\n> v0.5\n\n## API Operations\n\nNot a skill — this heading stays.\n";
    const doc = prepareInternalDoc({ relPath: "references/01/house-rules.md", markdown: md });
    expect(doc.title).toBe("EnGenius Craft AI — House Rules Contract");
    expect(doc.markdown).toContain("## API Operations");
    expect(doc.dropped).toEqual([]);
    expect(doc.meta).toEqual({ path: "references/01/house-rules.md", doc_kind: "doc" });
  });
});
