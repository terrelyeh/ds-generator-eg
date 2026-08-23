"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCodexCommand,
  buildImagePrompt,
  type PromptKind,
} from "@/lib/project-datasheet/image-prompt";

interface ModelPhoto {
  modelName: string;
  /** the cover shot, used as the shape reference */
  url: string | null;
}

/**
 * Compose the prompt for an application illustration, then get out of the way.
 *
 * The panel does not call an image model — see `image-prompt.ts` for why. It
 * assembles the house style around whatever you type, hands you the text, and
 * points at the product photo you need to attach.
 *
 * The composed prompt is EDITABLE, and editing it wins: the fields stop
 * overwriting the box the moment you type in it. A generated-but-locked
 * textarea would be useless here, because the wording is exactly the thing
 * that gets adjusted after looking at a result — and a box that silently
 * reverted your edit on the next keystroke elsewhere would be worse than
 * either.
 */
export function ImagePromptPanel({ models }: { models: ModelPhoto[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PromptKind>("scene");
  const [scene, setScene] = useState("");
  const [equipment, setEquipment] = useState("");
  const [modelName, setModelName] = useState(models[0]?.modelName ?? "");
  const [text, setText] = useState("");
  /** true once the author has typed in the box — fields stop overwriting it */
  const [edited, setEdited] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const composed = useMemo(
    () => buildImagePrompt({ kind, scene, modelName, equipment }),
    [kind, scene, modelName, equipment],
  );

  useEffect(() => {
    if (!edited) setText(composed);
  }, [composed, edited]);

  const photo = models.find((m) => m.modelName === modelName)?.url ?? null;

  async function copy(what: string, label: string) {
    try {
      await navigator.clipboard.writeText(what);
      toast.success(`已複製${label}`);
    } catch {
      // Clipboard is blocked in some contexts; selecting is the fallback that
      // always works, and leaves the person one keystroke from copying.
      boxRef.current?.select();
      toast.error("瀏覽器擋住了複製，已幫你選取，按 ⌘C");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-engenius-blue hover:underline"
      >
        產生應用情境圖的提示詞 →
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          組出一段提示詞，你拿去自己的圖像工具產圖，再回來上傳。
          <strong>下面的文字可以直接改</strong>——改過之後上面的欄位就不會再覆蓋它。
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
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">哪一種圖</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PromptKind)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
          >
            <option value="scene">場域圖（一個實際的地方）</option>
            <option value="architecture">架構圖（抽象，不綁產業）</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">照哪一台的產品照畫</span>
          <select
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
          >
            {models.map((m) => (
              <option key={m.modelName} value={m.modelName}>
                {m.modelName}
                {m.url ? "" : "（沒有產品照）"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs">
        <span className="mb-1 block text-muted-foreground">
          {kind === "scene" ? "這是什麼場域" : "這張圖要說明什麼"}
        </span>
        <Input
          value={scene}
          onChange={(e) => setScene(e.target.value)}
          placeholder={
            kind === "scene"
              ? "例：一間新蓋好的便利店，機器裝在側牆高處"
              : "例：基地台 → 牆上的機器 → 穿牆 → PoE switch → 下游設備"
          }
          className="h-8 text-xs"
        />
      </label>

      <label className="block text-xs">
        <span className="mb-1 block text-muted-foreground">
          畫面裡還要有哪些設備（選填，一個也不填就只畫我們的機器）
        </span>
        <Input
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          placeholder="例：a compact network switch, a POS terminal, a bullet IP camera"
          className="h-8 text-xs"
        />
      </label>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            提示詞{edited && <span className="ml-1 text-[#b45309]">已手動修改</span>}
          </span>
          {edited && (
            <button
              type="button"
              onClick={() => {
                setEdited(false);
                setText(composed);
              }}
              className="text-xs text-muted-foreground hover:underline"
            >
              捨棄修改，用欄位重新組合
            </button>
          )}
        </div>
        <Textarea
          ref={boxRef}
          rows={12}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEdited(true);
          }}
          className="font-mono text-[11px] leading-relaxed"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void copy(text, "提示詞")}>
          複製提示詞
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void copy(buildCodexCommand(photo ? `${modelName}.jpg` : ""), "指令")}
        >
          複製 Codex 指令
        </Button>
        {photo ? (
          <a
            href={photo}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="text-xs text-engenius-blue hover:underline"
          >
            下載 {modelName} 的產品照（提示詞要附這張）
          </a>
        ) : (
          <span className="text-xs text-[#b45309]">
            {modelName} 還沒有封面產品照——沒有參考圖的話機器會被畫成別的樣子
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        產完圖回到上面「上傳圖片」加進來。第一張是主圖，之後每一張排成下方一列情境小圖。
      </p>
    </div>
  );
}
