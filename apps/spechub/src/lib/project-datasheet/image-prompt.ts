/**
 * The house style for an application illustration, as a prompt you can paste
 * into whatever image tool you use.
 *
 * Deliberately NOT a call to an image model from the server. Generating one of
 * these took three to eight minutes in practice and timed out once, so putting
 * it behind a button means background jobs, polling and retries — a lot of
 * machinery to save a copy-paste. And the run that produced the EOR sheet's
 * four illustrations changed the brief five times after LOOKING at a result
 * ("too much shading", "line art not photoreal", "the unit is drawn too big").
 * That loop is instant in the tool you already have open and slower through a
 * queue.
 *
 * What is actually worth keeping is this file: the style contract below is why
 * those images are usable, and it works exactly as well pasted by hand.
 *
 * When to revisit: once this is a weekly job AND the wording has stopped
 * changing. Neither is true yet.
 */

export type PromptKind = "architecture" | "scene";

export interface PromptInput {
  kind: PromptKind;
  /** what the picture shows, in the author's own words */
  scene: string;
  /** the model whose real photo goes in as the shape reference */
  modelName: string;
  /** downstream kit that should appear, free text; empty for none */
  equipment: string;
}

/**
 * Three rules that each cost a re-run to learn:
 *
 *  1. Attach the real product photo. Without it the enclosure is invented.
 *  2. State the physical size. Without it the unit gets drawn the size of a
 *     window — it is 145 mm, about a paperback.
 *  3. Say the face must be blank, not just "no text". Asked only for no text,
 *     the model still letters a wordmark onto the enclosure, and it comes out
 *     as convincing-looking nonsense.
 */
const STYLE = [
  "TRUE ISOMETRIC technical line illustration, parallel projection, 30-degree axes.",
  "Crisp thin uniform strokes, CAD precision, realistic proportions and structural detail.",
  "NO shading, NO hatching, NO cast shadows, NO drop shadows.",
  "Pure white background. Very light flat tints on a few surfaces only;",
  "thin blue accent lines for cables and radio links.",
].join(" ");

const NO_TEXT = [
  "CRITICAL — every surface must be COMPLETELY BLANK.",
  "No product branding, model names, logos, LED legends, port markings or screen content.",
  "ABSOLUTELY NO TEXT ANYWHERE IN THE IMAGE: no letters, numbers, labels,",
  "dimension lines, callouts or signage. Labels are typeset by the layout, not drawn.",
].join(" ");

const SCALE =
  "SCALE IS CRITICAL: the real unit is about 145 mm wide — roughly a paperback book — " +
  "so it must read as a SMALL box. Do not enlarge it.";

export function buildImagePrompt({ kind, scene, modelName, equipment }: PromptInput): string {
  const model = modelName.trim() || "the outdoor cellular router";
  const what = scene.trim() || (kind === "architecture" ? "（還沒填場景）" : "（還沒填場域）");
  const kit = equipment.trim();

  const subject =
    kind === "architecture"
      ? [
          "An ABSTRACT SYSTEM DIAGRAM — no complete building, no landscape, no street.",
          "Objects sit on plain white, well spaced, reading left to right, with clear gaps",
          "so a caption could sit beside each one.",
          what,
          kit ? `Downstream, fanning out from the switch: ${kit}.` : "",
        ]
      : [
          `Scene: ${what}`,
          `The reference router is mounted in it, in the way that place would really mount it.`,
          kit ? `Also visible: ${kit}.` : "",
          "Everything fully inside the frame with a comfortable margin, nothing cropped.",
        ];

  return [
    `The attached photo is the actual EnGenius ${model}. Match its real shape:`,
    "enclosure proportions, the antennas on top, the ribbed face, the bottom cable gland.",
    "",
    "Generate ONE image, 16:9 landscape. Generate once; do not run extra correction passes.",
    "",
    "Prompt:",
    STYLE,
    "",
    ...subject.filter(Boolean),
    "",
    SCALE,
    "",
    NO_TEXT,
  ].join("\n");
}

/**
 * The same prompt as a runnable command, because that is how these were
 * actually made. `-i` is variadic and will swallow a prompt passed as an
 * argument, so the prompt has to arrive on stdin.
 */
export function buildCodexCommand(photoPath: string): string {
  return [
    "# 1. 把上面的提示詞存成 prompt.txt，產品照放在手邊",
    `codex exec -s workspace-write --skip-git-repo-check \\`,
    `  -i "${photoPath || "產品照.jpg"}" - < prompt.txt`,
  ].join("\n");
}
