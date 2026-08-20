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
  onApplied,
}: {
  docId: string;
  modelId: string;
  modelName: string;
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
    return (
      <button
        type="button"
        className="text-xs text-engenius-blue hover:underline"
        onClick={() => setOpen(true)}
      >
        從來源讀取規格…
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        上傳原廠的 PDF／Excel，或直接貼規格表。讀進來的是<strong>原文照抄</strong>——
        單位、全形符號都不會動，要改的部分留給規則層，這樣才看得出哪些是我們改的。
      </p>

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
            <span className="text-xs text-muted-foreground">或貼在下面 ↓</span>
          </div>
          <Textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Model\tM16K06\nCPU\tMTK7621AT+SDX12\nDimension\t145X130X45MM"}
            className="font-mono text-xs"
          />
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
            <Button size="sm" disabled={busy || preview.rows.length === 0} onClick={() => void apply()}>
              {busy ? "寫入中…" : `寫入 ${preview.rows.length} 列`}
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
