"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ExtractedRow {
  key: string;
  label: string;
  value: string;
  group?: string;
  source_page?: number | null;
  confidence?: number | null;
}

interface Preview {
  sourceId: string;
  rows: ExtractedRow[];
  notes: string;
  orphans: string[];
  /** this column's spec table currently comes from our own catalogue */
  fromCatalog: boolean;
  replacing: number;
  lowConfidence: number;
}

/**
 * Read a supplier spec sheet into this model's source rows.
 *
 * Applying REPLACES `raw_doc`, so the preview leads with what that costs:
 * how many rows are being replaced, and which existing rules name labels
 * this reading no longer produces. Those rules don't disappear — they just stop
 * applying, which is the quiet failure this module exists to make loud.
 */
export function SourceExtract({
  docId,
  modelId,
  modelName,
  hasExistingSpecs = false,
  onApplied,
}: {
  docId: string;
  modelId: string;
  modelName: string;
  /** Drives the warning — reading a source REPLACES what's already there. */
  hasExistingSpecs?: boolean;
  onApplied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(body: BodyInit, headers?: HeadersInit) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${docId}/extract`, {
        method: "POST",
        headers,
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "讀取失敗");
      setPreview(json);
      if (json.rows.length === 0) toast.warning("沒有讀到任何規格列。");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "讀取失敗");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("modelId", modelId);
    await send(form);
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${docId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", modelId, sourceId: preview.sourceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "套用失敗");
      toast.success(`${modelName}：寫入 ${json.rows} 列來源規格`);
      setPreview(null);
      setText("");
      setOpen(false);
      onApplied?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "套用失敗");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    // A text link reading "從來源讀取規格…" was doing the work of the whole
    // feature and got mistaken for a label — the question it produced was
    // "can I upload a PDF here?", which is precisely what it does. A button
    // that names the file types answers that without being clicked.
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          上傳原廠 PDF / Excel 讀規格
        </Button>
        {hasExistingSpecs && (
          <span className="text-xs text-amber-800">
            ⚠️ {modelName} 已經有規格了，讀新的會<strong>整份取代</strong>掉現在這些
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        上傳原廠的 PDF／Excel，或直接貼規格表。讀進來的是<strong>原文照抄</strong>——單位、全形符號都不會動。
      </p>
      {hasExistingSpecs && (
        <p className="rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <strong>{modelName} 目前已經有規格。</strong>
          讀新的來源會把「① 來源規格」<strong>整份換掉</strong>——不是合併，因為兩份讀取混在一起會變成跟哪一份原廠文件都對不起來的東西。
          <br />
          你下的調整規則<strong>不會</strong>被動到，但新來源如果找不到某個規格名，對應的規則就會失去對象——套用前的預覽會先把那些列出來。
          <br />
          想「多加一台」而不是「換掉這一台」的話，關掉這裡，用上面的
          <strong>「從廠商規格書建立」</strong>——那會新開一欄並直接帶你到它的上傳框，完全不動現有的。
        </p>
      )}

      {!preview && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.xlsx,.xlsm,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? "讀取中…" : "選擇 PDF / Excel"}
            </Button>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#231f20]">或直接貼上規格表</p>
            <p className="text-xs text-muted-foreground">
              沒有檔案、或原廠只給一段文字的時候用。從 PDF／Excel 複製整張表貼進來就行，
              一行一列：<code className="rounded bg-muted px-1">規格名 ⇥ Tab ⇥ 值</code>。貼完按「讀取貼上的內容」，一樣會整理成規格列給你確認。
            </p>
            <Textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Model\tM16K06\nCPU\tMTK7621AT+SDX12\nDimension\t145X130X45MM"}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !text.trim()}
              onClick={() =>
                void send(JSON.stringify({ action: "parse", modelId, text }), {
                  "Content-Type": "application/json",
                })
              }
            >
              讀取貼上的內容
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              收起
            </Button>
          </div>
        </>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="space-y-1 text-xs">
            <p>
              讀到 <strong>{preview.rows.length}</strong> 列
              {preview.lowConfidence > 0 && (
                <>
                  {" "}
                  （其中 <strong>{preview.lowConfidence}</strong> 列判讀有把握度不高，套用後記得看一下）
                </>
              )}
              。
            </p>
            {preview.replacing > 0 && (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
                <strong>會取代掉現有的 {preview.replacing} 列來源規格。</strong>
                你自己下的規則不會動——但下面列出的那些會失去對象。
              </p>
            )}
            {/* The one change here that is invisible afterwards. Everything
                else on this screen shows up in the spec table; this shows up
                only as findings that quietly stop appearing. */}
            {preview.fromCatalog && (
              <div className="rounded border-2 border-red-300 bg-red-50 px-2.5 py-2 text-red-900">
                <strong>這一欄目前是從我們自己的型號帶入的。</strong>
                <span className="ml-1">套用廠商規格書之後，它會變成廠商來源，而且：</span>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    <strong>「改了公開 datasheet 上查得到的數字」這條檢查會停止對它發動</strong>
                    ——但型號名稱還是我們的，客戶還是可以拿官網那份並排比。
                  </li>
                  <li>補一條原廠沒寫的規格，會從「提醒」變成「擋住送出」。</li>
                </ul>
                <span className="mt-1 block">
                  如果你要的是「我們自己的型號 + 一台 sourcing 的」並排，請
                  <strong>另外新增一台型號</strong>再對那一欄讀取，不要覆蓋這一欄。
                </span>
              </div>
            )}
            {preview.orphans.length > 0 && (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
                <strong>這些規則會失效：</strong>
                {preview.orphans.join("、")}
                <br />
                新的讀法裡沒有這些規格名。套用後請到規則欄改掉，不然它們就只是靜靜不生效。
              </p>
            )}
            {preview.notes && (
              <p className="text-muted-foreground">讀取備註：{preview.notes}</p>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0">
                    <td className="w-8 px-2 py-1 text-center text-muted-foreground tabular-nums">
                      {r.source_page ?? "—"}
                    </td>
                    <td className="w-44 px-2 py-1 align-top font-medium text-[#231f20]">
                      {r.label}
                      {r.group && r.group !== "spec" && (
                        <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                          {r.group}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-pre-line px-2 py-1 align-top text-muted-foreground">
                      {r.value}
                    </td>
                    <td className="w-10 px-2 py-1 text-right align-top text-muted-foreground tabular-nums">
                      {r.confidence == null ? "" : r.confidence.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={preview.fromCatalog ? "destructive" : "default"}
              disabled={busy || preview.rows.length === 0}
              onClick={() => void apply()}
            >
              {busy
                ? "寫入中…"
                : preview.fromCatalog
                  ? `覆蓋這一欄，寫入 ${preview.rows.length} 列`
                  : `寫入 ${preview.rows.length} 列`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
              丟掉這次讀取
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
