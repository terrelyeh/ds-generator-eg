"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { IntakeItem } from "@/lib/project-datasheet/intake";
import { ProposalList, defaultAccepted } from "@/components/project/proposal-list";

interface Proposal {
  items: IntakeItem[];
  ignored: string[];
}

/**
 * Requirements intake.
 *
 * Sales sends a few numbered lines mixing instructions with things only a
 * person can settle. This turns the first kind into proposed rules and the
 * second into questions — and then STOPS, because a model that rewrote the
 * rules of a document we are about to quote a customer from would be the
 * least auditable thing in the tool.
 */
export function RequirementsIntake({
  docId,
  modelCount,
  onGoToModels,
  onApplied,
}: {
  docId: string;
  /** Rules need something to apply to; with no columns this can only fail. */
  modelCount: number;
  onGoToModels?: () => void;
  onApplied?: () => void;
}) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);

  async function parse() {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const res = await fetch(`/api/projects/${docId}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "parse", text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "解析失敗");
      setSourceId(json.sourceId);
      setProposal(json.proposal);
      setAccepted(defaultAccepted(json.proposal.items as IntakeItem[]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解析失敗");
    } finally {
      setParsing(false);
    }
  }

  async function applySelected() {
    if (!sourceId || accepted.size === 0) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/projects/${docId}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", sourceId, accept: [...accepted] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "套用失敗");
      toast.success(
        `套用了 ${json.applied} 項${json.questions ? `，新增 ${json.questions} 個待問問題` : ""}`,
      );
      setProposal(null);
      setSourceId(null);
      setText("");
      onApplied?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "套用失敗");
    } finally {
      setApplying(false);
    }
  }

  function toggle(i: number) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <section className="space-y-4 rounded-lg border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-[#231f20]">
            ① 貼上業務需求
          </h2>
          <p className="mt-1 max-w-[640px] text-xs text-muted-foreground">
            把業務給的那段話<strong>原封不動</strong>貼進來，按「解析」。系統會把它拆成兩堆：
          </p>
          <ul className="mt-1.5 max-w-[640px] space-y-0.5 text-xs text-muted-foreground">
            <li>
              · <strong>能直接變成規則的</strong> —— 「不要放 chipset」→ 藏掉那幾列；
              「IP67」→ 加一列規格
            </li>
            <li>
              · <strong>只有人能回答的</strong> —— 「圖片是 EnGenius model」→
              哪一張？變成下面 ② 的待辦問題
            </li>
          </ul>
          <p className="mt-1.5 max-w-[640px] text-xs text-muted-foreground">
            前者列成建議給你勾，每一項都會標明<strong>依據是原文的哪一句</strong>。
            <strong>勾了按套用才會動到文件</strong>，解析本身不改任何東西。
          </p>
        </div>
        {!open && !proposal && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={modelCount === 0}
          >
            貼上需求
          </Button>
        )}
      </div>

      {/* The ① numbering reads as "start here", but rules need a column to
          apply to — "don't show the chipset" has to know whose chipset. So
          the first step is a model, and saying that here beats letting the
          parse fail with the same sentence after the fact. */}
      {modelCount === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          <span>
            <strong>要先有型號才能貼需求。</strong>
            規則得知道套在哪一台身上——「不要放 chipset」總得是某一台的 chipset。
            第一步請先去「規格與型號」加一台。
          </span>
          {onGoToModels && (
            <Button variant="outline" size="sm" onClick={onGoToModels}>
              去加型號
            </Button>
          )}
        </div>
      )}

      {(open || proposal) && (
        <>
          <Textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              "1. PDF 是範本\n2. 圖片是 EnGenius model\n3. spec note: 先不要放 WiFi 功能 / poe 是 802.3af/at / IP67\n4. 不要放 chipset\n5. 兩台型號放在一起"
            }
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void parse()} disabled={parsing || !text.trim()}>
              {parsing ? "解析中…" : "解析"}
            </Button>
            {!proposal && (
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                收起
              </Button>
            )}
          </div>
        </>
      )}

      {proposal && (
        <div className="space-y-3">
          {proposal.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              沒有解析出可以套用的項目。可能是這段話講的都是文件以外的事。
            </p>
          ) : (
            <>
              <ProposalList
                items={proposal.items}
                accepted={accepted}
                onToggle={toggle}
                onSelectAll={(all) =>
                  setAccepted(all ? new Set(proposal.items.map((_, i) => i)) : new Set())
                }
              />

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void applySelected()}
                  disabled={applying || accepted.size === 0}
                >
                  {applying ? "套用中…" : `套用勾選的 ${accepted.size} 項`}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setProposal(null);
                    setSourceId(null);
                  }}
                >
                  丟掉這次解析
                </Button>
              </div>
            </>
          )}

          {proposal.ignored.length > 0 && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <strong>沒有處理：</strong>
              <ul className="mt-1 space-y-0.5">
                {proposal.ignored.map((line, i) => (
                  <li key={i}>· {line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
