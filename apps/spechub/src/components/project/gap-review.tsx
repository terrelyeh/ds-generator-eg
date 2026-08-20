"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AskedOf, FindingKind, Severity } from "@/lib/project-datasheet/gap-scan";
import type { IntakeItem } from "@/lib/project-datasheet/intake";
import { ProposalList, defaultAccepted } from "@/components/project/proposal-list";

interface ReviewFinding {
  id: string;
  code: string;
  kind: FindingKind;
  severity: Severity;
  askedOf: AskedOf;
  title: string;
  detail: string;
  state: "open" | "answered" | "dismissed" | "resolved";
  answer: string | null;
}

export interface ReviewCounts {
  open: number;
  blocking: number;
  advisory: number;
  answered: number;
}

interface ReviewPayload {
  findings: ReviewFinding[];
  counts: ReviewCounts;
  brief: string;
}

const KIND_LABEL: Record<FindingKind, string> = { missing: "缺", doubt: "疑", risk: "險" };
const ASKED_LABEL: Record<AskedOf, string> = {
  rd: "RD",
  odm: "ODM",
  sales: "業務",
  internal: "我方",
};

/**
 * The gap review panel.
 *
 * Sits at the TOP of the editor, above the fields. What a project datasheet
 * needs next is more useful than what it currently says — the fields are
 * where you act on the answers, this is where you find out what to ask.
 */
export function GapReview({
  docId,
  onChanged,
  onCounts,
}: {
  docId: string;
  onChanged?: () => void;
  /** Lets the page header show the badge and work out the next step. */
  onCounts?: (counts: ReviewCounts) => void;
}) {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBrief, setShowBrief] = useState(false);
  const [brief, setBrief] = useState("");
  const [answering, setAnswering] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  // The rules an answer implies, waiting to be ticked. Never applied on the
  // way in: an answer arrives as one line of chat and is no more trustworthy
  // than the note that raised the question.
  const [proposed, setProposed] = useState<IntakeItem[] | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [showSettled, setShowSettled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${docId}/questions`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Scan failed");
      setData(json);
      setBrief(json.brief);
      onCounts?.(json.counts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "檢查失敗");
    } finally {
      setLoading(false);
    }
    // `onCounts` is a parent setState and stable enough in practice; including
    // it would re-run the scan on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Ask what the answer implies. No writes yet. */
  async function propose(questionId: string) {
    if (!answerText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${docId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "propose", questionId, answer: answerText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "解析失敗");
      const items = (json.items ?? []) as IntakeItem[];
      // Nothing to change is the COMMON case, not a failure — most answers to
      // a doubt confirm what the document already says. File it and move on
      // rather than making the user dismiss an empty list.
      if (items.length === 0) {
        await commit(questionId, []);
        toast.success("已記錄答覆（規格沒有需要改的地方）");
        return;
      }
      setProposed(items);
      setAccepted(defaultAccepted(items));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解析失敗");
    } finally {
      setBusy(false);
    }
  }

  /** File the answer and apply whatever was ticked. */
  async function commit(questionId: string, items: IntakeItem[]) {
    const res = await fetch(`/api/projects/${docId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply", questionId, answer: answerText, items }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "套用失敗");
    setAnswering(null);
    setAnswerText("");
    setProposed(null);
    await load();
    onChanged?.();
    return json as { applied: number };
  }

  async function setState(
    questionId: string,
    state: "open" | "answered" | "dismissed",
    answer?: string,
  ) {
    const res = await fetch(`/api/projects/${docId}/questions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, state, answer }),
    });
    const json = await res.json();
    if (!res.ok) return toast.error(json.error ?? "Update failed");
    setAnswering(null);
    setAnswerText("");
    await load();
    onChanged?.();
  }

  if (loading && !data) {
    return (
      <section className="rounded-lg border p-5 text-sm text-muted-foreground">
        檢查中…
      </section>
    );
  }
  if (!data) return null;

  const open = data.findings.filter((f) => f.state === "open");
  const settled = data.findings.filter((f) => f.state === "answered" || f.state === "dismissed");
  const blocking = open.filter((f) => f.severity === "blocking");
  const advisory = open.filter((f) => f.severity === "advisory");

  return (
    <section className="space-y-4 rounded-lg border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-[#231f20]">
            ② 還缺什麼 · 要問誰
          </h2>
          <p className="mt-1 max-w-[640px] text-xs text-muted-foreground">
            {blocking.length > 0 ? (
              <>
                <strong className="text-amber-700">{blocking.length} 項</strong>{" "}
                在確認前不建議送出，另有 {advisory.length} 項可以之後補。
                <strong>資料不齊是正常的</strong>——擋住的只有「會讓文件寫錯」的部分
                （我們自己編的數字、自相矛盾的規格、說要拿掉卻還在的字）。
              </>
            ) : open.length > 0 ? (
              <>沒有會出錯的項目，剩下 {open.length} 項是待補的資料，不影響先送一版。</>
            ) : (
              <>沒有待釐清的項目。</>
            )}
          </p>
          <p className="mt-1.5 max-w-[640px] text-xs text-muted-foreground">
            <strong>怎麼用：</strong>按「產生澄清訊息」→ 複製 → 貼給 RD／ODM／業務。
            他們回了之後回來按該項的「記錄答覆」，把原話貼上——
            系統會讀一遍，<strong>告訴你規格表要不要跟著改</strong>，改什麼由你勾。
            只是確認（「對，就是 IP67」）就不會有任何改動，只留下紀錄。
          </p>
          <p className="mt-1.5 max-w-[640px] text-xs text-muted-foreground">
            <strong>「重新檢查」不用 AI、不花錢</strong>——這裡的每一條都是固定規則比對，
            按幾次都一樣。會用到 AI 的只有三個地方：上面的「解析」、這裡的「記錄答覆」、
            以及型號區的「上傳原廠 PDF / Excel」。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {/* People reasonably assume anything that "checks" costs tokens.
              It doesn't — every rule here is deterministic — and saying so
              is what stops the button being used less than it should be. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            title="這個檢查不用 AI，是固定的規則比對，按幾次都不花錢"
          >
            重新檢查
          </Button>
          <Button size="sm" onClick={() => setShowBrief((v) => !v)}>
            {showBrief ? "收起訊息" : "產生澄清訊息"}
          </Button>
        </div>
      </div>

      {showBrief && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              可以直接貼給業務／RD／ODM。內容可以改，改完再複製。
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(brief);
                toast.success("已複製");
              }}
            >
              複製
            </Button>
          </div>
          <Textarea
            rows={16}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      )}

      {open.length > 0 && (
        <ul className="divide-y rounded-md border">
          {[...blocking, ...advisory].map((f) => (
            <li key={f.id || f.code} className="space-y-2 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    f.severity === "blocking"
                      ? "bg-amber-100 text-amber-900"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {KIND_LABEL[f.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[#231f20]">{f.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{f.detail}</div>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {ASKED_LABEL[f.askedOf]}
                </span>
              </div>

              {answering === f.id ? (
                <div className="space-y-2 pl-8">
                  <Textarea
                    rows={2}
                    autoFocus
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="他們怎麼回的？照抄就好。"
                    disabled={!!proposed}
                  />
                  {proposed ? (
                    <div className="space-y-2">
                      <ProposalList
                        items={proposed}
                        accepted={accepted}
                        onToggle={(i) =>
                          setAccepted((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        onSelectAll={(all) =>
                          setAccepted(all ? new Set(proposed.map((_, i) => i)) : new Set())
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const r = await commit(
                                f.id,
                                [...accepted].map((i) => proposed[i]),
                              );
                              toast.success(
                                r.applied
                                  ? `已記錄答覆，套用 ${r.applied} 項規格變更`
                                  : "已記錄答覆",
                              );
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "套用失敗");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {accepted.size
                            ? `記錄答覆並套用 ${accepted.size} 項`
                            : "只記錄答覆，不改規格"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setProposed(null);
                            setAccepted(new Set());
                          }}
                        >
                          回上一步
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!answerText.trim() || busy}
                        onClick={() => void propose(f.id)}
                      >
                        {busy ? "看看要改什麼…" : "記錄答覆"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAnswering(null);
                          setProposed(null);
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  )}
                  {!proposed && (
                    <p className="text-[11px] text-muted-foreground">
                      會先讀一遍答覆，看看規格表需不需要跟著改，改什麼由你決定。
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex gap-3 pl-8 text-xs">
                  <button
                    type="button"
                    className="text-engenius-blue hover:underline"
                    onClick={() => {
                      setAnswering(f.id);
                      setAnswerText("");
                      setProposed(null);
                    }}
                  >
                    記錄答覆
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:underline"
                    onClick={() => void setState(f.id, "dismissed", "不適用")}
                  >
                    不適用
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {settled.length > 0 && (
        <div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setShowSettled((v) => !v)}
          >
            {showSettled ? "隱藏" : "顯示"}已確認的 {settled.length} 項
          </button>
          {showSettled && (
            <ul className="mt-2 divide-y rounded-md border text-xs">
              {settled.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[#231f20]">{f.title}</div>
                    {f.answer && (
                      <div className="mt-0.5 text-muted-foreground">↳ {f.answer}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:underline"
                    onClick={() => void setState(f.id, "open")}
                  >
                    重新打開
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
