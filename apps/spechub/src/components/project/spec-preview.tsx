"use client";

import { useMemo, useState } from "react";
import { resolveMatrix, normalizeKey } from "@/lib/project-datasheet/resolve";
import { parseRules, parseSpecRows } from "@/lib/project-datasheet/text-format";
import type { BlankMode, CellOrigin, DocRules } from "@/lib/project-datasheet/types";

const ORIGIN_LABEL: Record<CellOrigin, string> = {
  source: "來源",
  override: "改過",
  added: "新增",
  blank: "沒值",
};

const ORIGIN_STYLE: Record<CellOrigin, string> = {
  source: "text-muted-foreground",
  override: "bg-amber-100 text-amber-900",
  added: "bg-sky-100 text-sky-900",
  blank: "text-muted-foreground italic",
};

export interface PreviewModel {
  id: string;
  model_name: string;
  /** the Source specs textarea, verbatim */
  raw: string;
  /** the per-model rules textarea, verbatim */
  rules: string;
}

/**
 * The spec table as it will actually print, recomputed as you type.
 *
 * The rules boxes take a line-based syntax, and reading syntax is not the
 * same as knowing what it did — the question this exists to answer is
 * literally "顯示邏輯是什麼". So: source rows in, rules applied, and every
 * cell says where its value came from. A row that vanished is listed
 * separately rather than simply being absent, because "did my hide rule
 * work, or did I typo the key" is otherwise unanswerable without diffing
 * two lists by eye.
 *
 * Hiding is the one edit offered here. It is by far the most common ("don't
 * show the chipset"), it is a single token, and doing it by clicking the row
 * you can see beats working out that "Power Consumption" is spelled
 * `power_consumption` in the rules box.
 */
export function SpecPreview({
  models,
  docRulesText,
  blankPolicy,
  onToggleHide,
}: {
  models: PreviewModel[];
  docRulesText: string;
  blankPolicy: string;
  onToggleHide: (key: string, hide: boolean) => void;
}) {
  const [group, setGroup] = useState("spec");

  const { rows, hidden, groups } = useMemo(() => {
    const docRules = parseRules(docRulesText);
    const parsed = models.map((m) => ({
      raw_doc: parseSpecRows(m.raw),
      rules: parseRules(m.rules),
    }));

    const resolved = resolveMatrix({
      models: parsed,
      docRules: docRules as DocRules,
      blankPolicy: (blankPolicy as BlankMode) ?? "tbd",
    });

    // Every label the sources carry, so a hidden row can be named rather than
    // just missing.
    const labels = new Map<string, string>();
    for (const p of parsed) {
      for (const r of p.raw_doc) if (!labels.has(r.key)) labels.set(r.key, r.label);
    }
    const hiddenKeys = new Set<string>([
      ...(docRules.hide ?? []),
      ...parsed.flatMap((p) => p.rules.hide ?? []),
    ]);

    return {
      rows: resolved,
      hidden: [...hiddenKeys].map((k) => ({ key: k, label: labels.get(k) ?? k })),
      groups: [...new Set(resolved.map((r) => r.group))],
    };
  }, [models, docRulesText, blankPolicy]);

  const shown = rows.filter((r) => r.group === group);
  const totalCols = models.length;

  return (
    <div className="space-y-3">
      {groups.length > 1 && (
        <div className="flex gap-1 text-xs">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`rounded px-2 py-1 ${
                g === group ? "bg-[#231f20] text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {g === "spec"
                ? "規格表"
                : g === "software"
                  ? "Software Features"
                  : "Package Contents"}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          還沒有規格。到下面的型號區「上傳原廠 PDF / Excel」或直接手打。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          {/* Fixed layout so the model columns split what's left evenly.
              With auto layout a long first value claimed most of the width
              and pushed the last model off the edge. */}
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col className="w-[150px]" />
              {models.map((m) => (
                <col key={m.id} style={{ width: `${Math.floor(100 / models.length)}%` }} />
              ))}
              <col className="w-[52px]" />
            </colgroup>
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-2 py-1.5 text-left font-medium">規格</th>
                {models.map((m) => (
                  <th key={m.id} className="px-2 py-1.5 text-left font-medium">
                    {m.model_name}
                  </th>
                ))}
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="border-b last:border-0 align-top">
                  <td className="px-2 py-1.5 align-top">
                    <span className="font-medium break-words text-[#231f20]">{r.label}</span>
                    <code className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                      {r.key}
                    </code>
                  </td>
                  {r.cells.slice(0, totalCols).map((c, i) => (
                    <td key={i} className="px-2 py-1.5">
                      <span
                        className={`whitespace-pre-line break-words ${
                          c.isBlank ? "italic text-muted-foreground" : "text-[#231f20]"
                        }`}
                      >
                        {c.value || "—"}
                      </span>
                      {c.origin !== "source" && (
                        <span
                          className={`ml-1 rounded px-1 py-0.5 text-[9px] ${ORIGIN_STYLE[c.origin]}`}
                        >
                          {ORIGIN_LABEL[c.origin]}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onToggleHide(r.key, true)}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      隱藏
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hidden.length > 0 && (
        <div className="rounded-md border border-dashed bg-muted/30 p-2.5">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            已隱藏的 {hidden.length} 列（不會印出來）
          </p>
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((h) => (
              <button
                key={h.key}
                type="button"
                onClick={() => onToggleHide(h.key, false)}
                title="點一下取消隱藏"
                className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground line-through hover:text-foreground hover:no-underline"
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        這張表就是 PDF 上會印的內容，會隨著你改規則即時更新。
        <span className="mx-1 rounded bg-amber-100 px-1 py-0.5 text-amber-900">改過</span>
        = 規則覆寫了來源的值，
        <span className="mx-1 rounded bg-sky-100 px-1 py-0.5 text-sky-900">新增</span>
        = 來源沒有、我們自己加的。沒有標記的就是原廠寫什麼、我們印什麼。
      </p>
    </div>
  );
}

/** Append or remove a `- key` line in a rules textarea. */
export function toggleHideLine(rulesText: string, key: string, hide: boolean): string {
  const lines = rulesText.split("\n");
  const isHideFor = (line: string) =>
    line.trim().startsWith("-") && normalizeKey(line.trim().slice(1)) === key;

  if (!hide) return lines.filter((l) => !isHideFor(l)).join("\n").replace(/\n{3,}/g, "\n\n");
  if (lines.some(isHideFor)) return rulesText;
  return [...lines.filter((l) => l.trim()), `- ${key}`].join("\n");
}
