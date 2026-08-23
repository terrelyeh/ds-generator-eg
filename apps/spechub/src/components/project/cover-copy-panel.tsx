"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  serializeFeatures,
  type CoverDraft,
} from "@/lib/project-datasheet/cover-copy";

type Loaded = CoverDraft & { seriesName: string; specRows: number };

/** What the panel can fill, in the order the fields appear in the form. */
export interface CoverPatch {
  headline?: string;
  seriesName?: string;
  categoryLabel?: string;
  overview?: string;
  features?: string;
  diagramTitle?: string;
  diagramNote?: string;
}

/**
 * Draft page one from the spec table.
 *
 * Only earns its place on the ODM path. Seeding from a catalogue model now
 * brings our own approved English across, so on that path the boxes are
 * already full and better than anything drafted here. A document built from
 * a supplier's PDF has nothing: its overview is a paragraph of chipset names,
 * and page one goes out blank unless somebody writes two paragraphs of
 * marketing prose at the end of the day. That is when this is worth a click.
 *
 * ── Field by field, not all at once ─────────────────────────────────────
 * "Use all of it" would be the obvious button and the wrong one. These four
 * fields are not equally trustworthy: a headline is three words you can
 * check at a glance, and Features is four claims that each need reading
 * against the table. Applying them together means the headline's ease
 * vouches for the bullets' risk.
 *
 * Nothing here saves. Every button fills the form field and leaves it, under
 * the same Save the rest of the page uses.
 */
export function CoverCopyPanel({
  docId,
  onFill,
}: {
  docId: string;
  onFill: (patch: CoverPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Loaded | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${docId}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hint }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "產生失敗");
      setDraft(json);
      toast.success(`草稿好了，引用了 ${json.specRows} 條規格`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "產生失敗");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-engenius-blue hover:underline"
      >
        用 AI 起草封面文案 →
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          從這份文件的<strong>規格表</strong>起草主標、分類、Overview、Features，還有第 2 頁架構圖旁邊那段。
          一格一格填，<strong>填進去不會存檔</strong>，還是按下面原本的儲存。
          <br />
          從既有型號帶入的文件用不到這個——那條路已經把我們自己寫好的文案帶進來了。
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
        <label className="min-w-[240px] flex-1 text-xs">
          <span className="mb-1 block text-muted-foreground">
            這個標案在意什麼<span className="ml-1">選填</span>
          </span>
          <Input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void generate();
              }
            }}
            placeholder="例：戶外、免施工、要能吃 PoE"
            className="h-8 text-xs"
          />
        </label>
        <Button size="sm" disabled={busy} onClick={() => void generate()}>
          {busy ? "產生中…" : draft ? "再產生一次" : "產生草稿"}
        </Button>
      </div>

      {draft && (
        <div className="space-y-2">
          <Row
            label="主標"
            value={draft.headline}
            onFill={() => onFill({ headline: draft.headline })}
          />
          <Row
            label="副標"
            value={draft.seriesName}
            note="直接用型號，不是模型寫的"
            onFill={() => onFill({ seriesName: draft.seriesName })}
          />
          <Row
            label="分類標籤"
            value={draft.categoryLabel}
            onFill={() => onFill({ categoryLabel: draft.categoryLabel })}
          />
          <Row
            label="Overview"
            value={draft.overview}
            note={`${draft.overview.length} 字${draft.overview.length > 500 ? "——超過 500 字，封面會被裁掉" : ""}`}
            warn={draft.overview.length > 500}
            onFill={() => onFill({ overview: draft.overview })}
          />

          <Row
            label="架構圖的標題"
            value={draft.diagramTitle}
            onFill={() => onFill({ diagramTitle: draft.diagramTitle })}
          />
          <Row
            label="架構圖的說明"
            value={draft.diagramNote}
            note={`${draft.diagramNote.length} 字${draft.diagramNote.length > 420 ? "——偏長，版面是圖旁邊的一欄" : ""}`}
            warn={draft.diagramNote.length > 420}
            onFill={() => onFill({ diagramNote: draft.diagramNote })}
          />

          {draft.features.length > 0 && (
            <div className="rounded border bg-background p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#231f20]">
                  Features &amp; Benefits
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {draft.features.length} 個區塊
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onFill({ features: serializeFeatures(draft.features) })}
                  className="shrink-0 rounded border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  填進去
                </button>
              </div>
              {draft.features.map((b, i) => (
                <div key={i} className={i ? "mt-2" : ""}>
                  <p className="text-[11px] font-semibold text-[#231f20]">{b.title}</p>
                  <ul className="space-y-0.5">
                    {b.bullets.map((x, j) => (
                      <li key={j} className="text-[11px] leading-relaxed">
                        <span className="text-[#231f20]">・{x.text}</span>
                        {x.basis ? (
                          <span className="ml-1.5 text-muted-foreground">依規格：{x.basis}</span>
                        ) : (
                          <span className="ml-1.5 text-[#b45309]">沒有規格依據，自己確認</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {draft.declined.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
              {/* The useful half. A tender document usually wants these
                  sentences, and what this list is really saying is "go and
                  ask the supplier for these specs before you print". */}
              <p className="font-medium">這幾句這份規格表撐不起來，所以沒寫：</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {draft.declined.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  note,
  warn,
  onFill,
}: {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
  onFill: () => void;
}) {
  if (!value) return null;
  return (
    <div className="rounded border bg-background p-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[#231f20]">
          {label}
          {note && (
            <span className={`ml-1.5 font-normal ${warn ? "text-[#b45309]" : "text-muted-foreground"}`}>
              {note}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onFill}
          className="shrink-0 rounded border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
        >
          填進去
        </button>
      </div>
      <p className="whitespace-pre-line text-[11px] leading-relaxed text-[#231f20]">{value}</p>
    </div>
  );
}
