"use client";

import { describeItem, type IntakeItem } from "@/lib/project-datasheet/intake";

const TYPE_LABEL: Record<IntakeItem["type"], string> = {
  doc_hide: "隱藏",
  doc_override: "覆寫",
  model_add: "新增",
  model_hide: "隱藏",
  model_override: "覆寫",
  model_blank: "留白",
  doc_field: "文案",
  question: "待問",
};

/**
 * A reviewable list of proposed edits.
 *
 * Shared by requirements intake and by answers to gap-review questions,
 * because they are the same decision: a model read some prose, guessed what
 * it means for the document, and a human is about to say yes or no. Two
 * lists that looked slightly different would eventually mean two different
 * levels of care.
 */
export function ProposalList({
  items,
  accepted,
  onToggle,
  onSelectAll,
}: {
  items: IntakeItem[];
  accepted: Set<number>;
  onToggle: (i: number) => void;
  onSelectAll: (all: boolean) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {items.length} 項建議，已勾選 {accepted.size} 項。
        </p>
        <button
          type="button"
          className="text-xs text-engenius-blue hover:underline"
          onClick={() => onSelectAll(accepted.size !== items.length)}
        >
          {accepted.size === items.length ? "全部取消" : "全部勾選"}
        </button>
      </div>

      <ul className="divide-y rounded-md border">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 px-3 py-2.5">
            <input
              type="checkbox"
              checked={accepted.has(i)}
              onChange={() => onToggle(i)}
              className="mt-1"
            />
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                item.type === "question"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {TYPE_LABEL[item.type]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-[#231f20]">{describeItem(item)}</div>
              {item.type === "question" && item.detail && (
                <div className="mt-0.5 text-xs text-muted-foreground">{item.detail}</div>
              )}
              {/* What this would destroy. An override that lands on the wrong
                  row reads as a perfectly sensible proposal until you see the
                  value it replaces — so that value gets the loudest treatment
                  on the card, not a footnote. */}
              {item.replaces && (
                <div className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  <strong>會蓋掉現有的值：</strong>
                  <span className="whitespace-pre-line">{item.replaces}</span>
                </div>
              )}
              {/* The words it came from. Without them you cannot tell a
                  faithful reading from a hallucination. */}
              {item.because && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  依據：「{item.because}」
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Which items start ticked: everything except what would overwrite an
 * existing value. Those are the ones with a real cost when the model guessed
 * wrong, so they have to be chosen deliberately.
 */
export function defaultAccepted(items: IntakeItem[]): Set<number> {
  return new Set(items.map((item, i) => (item.replaces ? -1 : i)).filter((i) => i >= 0));
}
