"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ModelImage } from "@/lib/project-datasheet/types";

/**
 * Upload and arrange the images a project datasheet prints.
 *
 * `product` is the cover shot; everything else lands on the Hardware
 * Overview page in order. A document-level manager (no `modelId`) handles
 * the deployment diagram.
 *
 * Thumbnails rather than a list of URLs, because the mistake this prevents
 * is uploading the wrong angle — which a filename does not reveal and a
 * 96px render does immediately.
 */
export function ImageManager({
  docId,
  modelId,
  initial,
  slots,
  label,
  hint,
}: {
  docId: string;
  /** null = the document itself (deployment diagram) */
  modelId: string | null;
  initial: ModelImage[];
  /** which slots this target offers, first one is the default */
  slots: { value: string; label: string }[];
  label: string;
  hint: string;
}) {
  const [images, setImages] = useState<ModelImage[]>(initial);
  const [slot, setSlot] = useState(slots[0].value);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList) {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("slot", slot);
        if (modelId) form.append("modelId", modelId);
        const res = await fetch(`/api/projects/${docId}/images`, { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "上傳失敗");
        setImages(json.images);
        // After the cover is set, further files are almost always the other
        // angles — saves picking the slot again for each one.
        if (slot === "product" && slots.some((s) => s.value === "view")) setSlot("view");
      }
      toast.success("已上傳");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上傳失敗");
    } finally {
      setBusy(false);
    }
  }

  async function remove(url: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${docId}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, modelId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "移除失敗");
      setImages(json.images);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移除失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-[#231f20]">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((img) => (
            <li
              key={img.url}
              className="relative w-[104px] rounded-md border bg-white p-1.5 text-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.slot}
                className="mx-auto h-[76px] w-full object-contain"
              />
              <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                {slots.find((s) => s.value === img.slot)?.label ?? img.slot}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(img.url)}
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full border bg-background text-xs leading-none text-muted-foreground hover:text-destructive"
                aria-label="移除"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
        >
          {slots.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "上傳中…" : "上傳圖片"}
        </Button>
        <span className="text-xs text-muted-foreground">
          PNG / JPEG / WebP / SVG，單張 12 MB 內，可一次選多張
        </span>
      </div>
    </div>
  );
}

export const MODEL_SLOTS = [
  { value: "product", label: "封面主圖" },
  { value: "view", label: "硬體外觀" },
];

export const DOC_SLOTS = [{ value: "diagram", label: "部署示意圖" }];
