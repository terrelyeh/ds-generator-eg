"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type ReviewStatus = "draft" | "changes_requested" | "approved";

interface Review {
  id: string;
  action: "approved" | "changes_requested" | "commented";
  comment: string | null;
  target_field: string | null;
  target_index: number | null;
  reviewer_name: string | null;
  created_at: string;
}

const STATUS_META: Record<ReviewStatus, { label: string; cls: string }> = {
  draft: { label: "待審核", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  changes_requested: { label: "已退回，待修改", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "已通過", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const TARGET_LABEL: Record<string, string> = {
  overview: "Overview",
  features: "Features",
  headline: "Headline",
  subtitle: "Subtitle",
  spec: "規格表",
  general: "整體",
};

function describeTarget(r: Review): string | null {
  if (!r.target_field) return null;
  const base = TARGET_LABEL[r.target_field] ?? r.target_field;
  return r.target_index === null || r.target_index === undefined
    ? base
    : `${base} #${r.target_index + 1}`;
}

/**
 * Review thread + actions for one product/locale.
 *
 * Shown to everyone who can see the product, not just reviewers — MKT is
 * the party that has to act on "changes requested", so hiding the thread
 * from them would defeat it. Only the action buttons are gated.
 */
export function ReviewPanel({
  modelName,
  locale,
  localeLabel,
  status,
  canReview,
  onStatusChange,
}: {
  modelName: string;
  locale: string;
  localeLabel: string;
  status: ReviewStatus;
  /** Server-resolved: role carries review.approve AND locale is in scope. */
  canReview: boolean;
  onStatusChange: (s: ReviewStatus) => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [targetField, setTargetField] = useState<string>("general");
  const [targetIndex, setTargetIndex] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [translated, setTranslated] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/translations/review?product=${encodeURIComponent(modelName)}&locale=${locale}`,
      );
      const data = await res.json();
      if (data.ok) setReviews(data.reviews ?? []);
    } catch {
      // a failed thread load shouldn't block editing
    } finally {
      setLoading(false);
    }
  }, [modelName, locale]);

  useEffect(() => {
    setTranslated({});
    load();
  }, [load]);

  async function act(action: Review["action"]) {
    if (action !== "approved" && !comment.trim()) {
      toast.error("退回或留言時請填寫意見");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/translations/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: modelName,
          locale,
          action,
          comment: comment.trim() || null,
          target_field: action === "approved" && !comment.trim() ? null : targetField,
          target_index:
            targetField === "features" && targetIndex !== ""
              ? Number(targetIndex) - 1
              : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "操作失敗");
        return;
      }
      setComment("");
      setTargetIndex("");
      if (data.review_status) onStatusChange(data.review_status);
      toast.success(
        action === "approved" ? "已通過" : action === "changes_requested" ? "已退回" : "已留言",
      );
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /** Reviewers write in their own language; MKT reads Chinese. */
  async function translateComment(r: Review) {
    if (!r.comment || translated[r.id]) return;
    setTranslating(r.id);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: r.comment,
          target_locale: "zh-TW",
          content_type: "overview",
          ref: `review-comment:${modelName}`,
        }),
      });
      const data = await res.json();
      if (data.ok) setTranslated((p) => ({ ...p, [r.id]: data.translated }));
      else toast.error(data.error ?? "翻譯失敗");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslating(null);
    }
  }

  const meta = STATUS_META[status];

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[#231f20]">審核 · {localeLabel}</h3>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
        {reviews.length > 0 && (
          <span className="text-xs text-slate-400">{reviews.length} 則紀錄</span>
        )}
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-xs text-slate-400">讀取中…</p>
        ) : reviews.length === 0 ? (
          <p className="text-xs text-slate-400">還沒有審核紀錄。</p>
        ) : (
          reviews.map((r) => {
            const target = describeTarget(r);
            return (
              <div key={r.id} className="border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-[#231f20]">
                    {r.reviewer_name ?? "（已移除的使用者）"}
                  </span>
                  <span
                    className={
                      r.action === "approved"
                        ? "text-emerald-600"
                        : r.action === "changes_requested"
                          ? "text-amber-600"
                          : "text-slate-500"
                    }
                  >
                    {r.action === "approved"
                      ? "通過"
                      : r.action === "changes_requested"
                        ? "退回"
                        : "留言"}
                  </span>
                  {target && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                      {target}
                    </span>
                  )}
                  <span className="ml-auto tabular-nums text-slate-400">
                    {new Date(r.created_at).toLocaleString("zh-TW")}
                  </span>
                </div>
                {r.comment && (
                  <>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.comment}</p>
                    {translated[r.id] ? (
                      <p className="mt-1 whitespace-pre-wrap rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-800">
                        {translated[r.id]}
                      </p>
                    ) : (
                      <button
                        onClick={() => translateComment(r)}
                        disabled={translating === r.id}
                        className="mt-1 text-xs text-indigo-600 hover:underline disabled:opacity-50"
                      >
                        {translating === r.id ? "翻譯中…" : "譯成中文"}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {canReview ? (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex gap-2">
            <select
              value={targetField}
              onChange={(e) => setTargetField(e.target.value)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
            >
              {Object.entries(TARGET_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {targetField === "features" && (
              <input
                type="number"
                min={1}
                value={targetIndex}
                onChange={(e) => setTargetIndex(e.target.value)}
                placeholder="第幾條"
                className="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              />
            )}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="哪裡要改、要改成什麼…"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => act("approved")} disabled={busy}>
              通過
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => act("changes_requested")}
              disabled={busy}
            >
              退回修改
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act("commented")} disabled={busy}>
              只留言
            </Button>
          </div>
          <p className="text-[11px] text-slate-400">
            「只留言」不會改變狀態 —— 提個小意見不該擋住或放行 PDF。
          </p>
        </div>
      ) : (
        <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
          你沒有審核 {localeLabel} 的權限，只能閱讀意見。
        </div>
      )}
    </div>
  );
}
