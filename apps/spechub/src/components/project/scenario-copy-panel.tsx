"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toCaption, type ScenarioDraft } from "@/lib/project-datasheet/scenarios";

export interface CopyTarget {
  url: string;
  /** the heading already on that picture, or "" */
  heading: string;
  slotLabel: string;
}

/**
 * Draft the "Application scenarios" copy from a sector name.
 *
 * The gap this fills: a supplier's spec sheet has a table and no scenarios,
 * or one line so general it says nothing. Somebody then writes four of them
 * from scratch, at the end of the day, for a tender due tomorrow — which is
 * how a datasheet ends up claiming failover it does not have.
 *
 * ── Why every bullet shows what it rests on ─────────────────────────────
 * The drafts are grounded in the document's own resolved spec table, so the
 * model CAN cite real rows. It can also write a fluent sentence about how a
 * site is wired, which no spec will ever contradict. Those two are worth
 * different amounts of a reviewer's attention, and telling them apart by
 * reading is exactly what nobody does at 6pm. So each bullet says which row
 * it came from, and the ones that came from none say so in amber.
 *
 * ── Nothing here saves ──────────────────────────────────────────────────
 * "用在這張圖" fills the caption fields below and leaves them unsaved, under
 * the same button as hand-typed copy. A generated paragraph should have to
 * clear the same bar as a written one, and be read once in place first.
 */
export function ScenarioCopyPanel({
  docId,
  targets,
  onUse,
}: {
  docId: string;
  targets: CopyTarget[];
  onUse: (draft: ScenarioDraft, url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<ScenarioDraft[]>([]);
  const [declined, setDeclined] = useState<string[]>([]);

  async function generate() {
    if (!term.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${docId}/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, count }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "產生失敗");
      setDrafts(json.scenarios);
      setDeclined(json.declined ?? []);
      toast.success(`草稿 ${json.scenarios.length} 段，引用了 ${json.specRows} 條規格`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "產生失敗");
    } finally {
      setBusy(false);
    }
  }

  async function copy(d: ScenarioDraft) {
    const text = [toCaption(d), ...d.bullets.map((b) => b.text)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已複製");
    } catch {
      toast.error("瀏覽器擋住了複製");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-engenius-blue hover:underline"
      >
        用 AI 起草情境文案 →
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          填一個產業或場域，起草每張情境圖旁邊的<strong>小標、引言和列點</strong>。
          只會引用這份文件規格表裡有的東西——<strong>沒有規格依據的句子會標成橘色</strong>，那幾句要自己看過。
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-xs text-muted-foreground hover:text-[#231f20] hover:underline"
        >
          收起
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-xs">
          <span className="mb-1 block text-muted-foreground">產業或場域</span>
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void generate();
              }
            }}
            placeholder="例：retail／港口物流／校園／連鎖藥局"
            className="h-8 text-xs"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">幾段</span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} 段{n === 4 ? "（一頁剛好）" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" disabled={busy || !term.trim()} onClick={() => void generate()}>
          {busy ? "產生中…" : drafts.length ? "再產生一次" : "產生草稿"}
        </Button>
      </div>

      {/* Re-running adds sites rather than rewriting: the headings already on
          the pictures go into the prompt as "do not restate these". */}
      {drafts.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          再按一次會換一批——已經寫在圖上的小標會被跳過，不會重複。
        </p>
      )}

      {declined.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
          <p className="font-medium">這幾種場域規格撐不起來，所以沒寫：</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {declined.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {drafts.map((d, i) => (
        <div key={i} className="rounded border bg-background p-2.5">
          <p className="text-xs font-semibold text-[#231f20]">{d.heading}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{d.lede}</p>
          <ul className="mt-1.5 space-y-1">
            {d.bullets.map((b, j) => (
              <li key={j} className="text-[11px] leading-relaxed">
                <span className="text-[#231f20]">・{b.text}</span>
                {b.basis ? (
                  <span className="ml-1.5 text-muted-foreground">依規格：{b.basis}</span>
                ) : (
                  <span className="ml-1.5 text-[#b45309]">沒有規格依據，自己確認</span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {targets.length > 0 ? (
              <>
                <span className="text-[11px] text-muted-foreground">用在：</span>
                {targets.map((t, k) => (
                  <button
                    key={t.url}
                    type="button"
                    onClick={() => onUse(d, t.url)}
                    title={t.heading || "（還沒寫文字）"}
                    className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    第 {k + 1} 張
                    {t.heading ? `：${t.heading}` : "（空的）"}
                  </button>
                ))}
              </>
            ) : (
              // Copy first, draw later. The picture usually does not exist
              // yet — the copy is what tells you what to draw, and the prompt
              // panel above wants this heading typed into it.
              <span className="text-[11px] text-muted-foreground">
                還沒有情境圖。先複製，拿去上面的提示詞面板當「這是什麼場域」。
              </span>
            )}
            <button
              type="button"
              onClick={() => void copy(d)}
              className="text-[11px] text-engenius-blue hover:underline"
            >
              複製
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
