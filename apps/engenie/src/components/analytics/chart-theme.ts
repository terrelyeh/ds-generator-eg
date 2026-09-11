/**
 * Chart colours for Workspace 分析, in one place (SVG can't read Tailwind
 * classes, so marks take these hex values directly). The outcome trio was run
 * through the dataviz palette validator: it passes colour-blind separation;
 * the amber sits under 3:1 on white, so it is never the only cue — every
 * chart has a legend and a table view.
 */
export const CHART = {
  /** EnGenius blue, the darker step — the brand's light blue is too pale for thin marks. */
  answered: "#0288d1",
  noMatch: "#f59e0b",
  error: "#dc2626",
  grid: "#f0f0f0",
  baseline: "#d9d9d9",
  tick: "#737373",
  idle: "#d4d4d4",
} as const;

export const OUTCOME_SERIES = [
  { key: "answered", label: "已回答", color: CHART.answered },
  { key: "noMatch", label: "答不出來", color: CHART.noMatch },
  { key: "errors", label: "錯誤", color: CHART.error },
] as const;
