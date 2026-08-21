"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LABEL_SIDES } from "@/lib/project-datasheet/types";
import type { ImageLabel, LabelSide, ModelImage } from "@/lib/project-datasheet/types";

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
  /** url of the image whose caption and labels are open for editing */
  const [editing, setEditing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Caption and labels save on their own request rather than with the
   * document's form. The uploader already writes `images` immediately, so a
   * form save posts whatever it loaded on mount — which is how an image
   * uploaded mid-edit used to vanish on the next Save.
   */
  async function saveMeta(
    url: string,
    patch: { caption?: string | null; body?: string[]; labels?: ImageLabel[] },
  ) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${docId}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, modelId, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "儲存失敗");
      setImages(json.images);
      toast.success("已儲存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

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
                onClick={() => setEditing(editing === img.url ? null : img.url)}
                className="mt-1 w-full rounded border px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              >
                {editing === img.url ? "收合" : "圖說／標註"}
              </button>
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

      {editing && images.some((i) => i.url === editing) && (
        <LabelEditor
          key={editing}
          image={images.find((i) => i.url === editing)!}
          busy={busy}
          onSave={(patch) => void saveMeta(editing, patch)}
        />
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

/**
 * Caption and on-image labels for one illustration.
 *
 * Labels are placed by clicking the picture, not by typing coordinates —
 * "62.4% across, 41% down" is not a thing anyone can judge from a number, and
 * the whole point is putting the word next to the right object. Dragging a
 * placed label moves it.
 *
 * The preview positions labels as a percentage of the image box, so the
 * editor can show the picture at any width and the placement still holds on
 * a Letter page.
 */
function LabelEditor({
  image,
  busy,
  onSave,
}: {
  image: ModelImage;
  busy: boolean;
  onSave: (patch: { caption: string | null; body: string[]; labels: ImageLabel[] }) => void;
}) {
  const [caption, setCaption] = useState(image.caption ?? "");
  /* Held as text, not an array: a textarea is how anyone writes a short list,
     and splitting on save keeps blank lines from becoming empty bullets. */
  const [body, setBody] = useState((image.body ?? []).join("\n"));
  const [labels, setLabels] = useState<ImageLabel[]>(image.labels ?? []);
  const [drag, setDrag] = useState<number | null>(null);
  /**
   * Index of the label just placed, so its text box takes the caret.
   *
   * Without it, clicking the picture drops a dot and nothing else visibly
   * happens — the row that wants typing is below the image, out of the eye's
   * path. The gesture reads as "nothing was added".
   */
  const [fresh, setFresh] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  function pointToPercent(e: { clientX: number; clientY: number }) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    const pct = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));
    return {
      x: pct(((e.clientX - box.left) / box.width) * 100),
      y: pct(((e.clientY - box.top) / box.height) * 100),
    };
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div
        ref={boxRef}
        className="relative mx-auto w-fit max-w-full cursor-crosshair select-none bg-white"
        onPointerMove={(e) => {
          if (drag === null) return;
          const at = pointToPercent(e);
          if (at) setLabels((ls) => ls.map((l, i) => (i === drag ? { ...l, ...at } : l)));
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt=""
          draggable={false}
          className="block max-h-[420px] w-auto max-w-full"
          onClick={(e) => {
            const at = pointToPercent(e);
            if (!at) return;
            setLabels((ls) => {
              setFresh(ls.length);
              return [...ls, { ...at, text: "", side: "right" }];
            });
          }}
        />
        {labels.map((l, i) => (
          <span key={i}>
            {/* The dot is what gets positioned; the box hangs off it. Same
                geometry as the print layout, so what is placed here is what
                comes out of the PDF. */}
            <span
              style={{ left: `${l.x}%`, top: `${l.y}%` }}
              className="pointer-events-none absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1b3a5c] ring-2 ring-white/95"
            />
            <span
              onPointerDown={(e) => {
                e.preventDefault();
                setDrag(i);
              }}
              style={{ left: `${l.x}%`, top: `${l.y}%`, transform: OFFSET[l.side ?? "right"] }}
              className="absolute cursor-move whitespace-nowrap rounded border border-[#d8dfe6] bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-[#1b3a5c] shadow-sm"
            >
              {l.text || `標籤 ${i + 1}`}
            </span>
          </span>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        <strong className="font-medium text-[#231f20]">點圖片上任一處就新增一個標記點</strong>
        ，可以加很多個；拖曳標籤可移動。文字會印在標記點旁邊，用下方的箭頭選要放哪一邊，
        才不會蓋到設備。
      </p>

      <div className="space-y-2">
        {labels.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={l.text}
              maxLength={60}
              placeholder="例：EOR200"
              ref={(el) => {
                if (el && fresh === i) {
                  el.focus();
                  setFresh(null);
                }
              }}
              onChange={(e) =>
                setLabels((ls) => ls.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
              }
              className="h-8 text-xs"
            />
            <div className="flex shrink-0 gap-0.5">
              {LABEL_SIDES.map((side) => (
                <button
                  key={side}
                  type="button"
                  title={SIDE_LABEL[side]}
                  onClick={() =>
                    setLabels((ls) => ls.map((x, j) => (j === i ? { ...x, side } : x)))
                  }
                  className={`h-6 w-6 rounded border text-[11px] leading-none ${
                    (l.side ?? "right") === side
                      ? "border-[#1b3a5c] bg-[#1b3a5c] text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {SIDE_GLYPH[side]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLabels((ls) => ls.filter((_, j) => j !== i))}
              className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
              aria-label="移除標籤"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium text-[#231f20]">圖說標題</label>
        <Input
          value={caption}
          placeholder="場景名稱 — 一句說明（破折號後面可留空）"
          onChange={(e) => setCaption(e.target.value)}
          className="mt-1 h-8 text-xs"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          破折號（—）前面是小標，後面那句會印在小標下面當引言。
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-[#231f20]">說明列點</label>
        <textarea
          value={body}
          rows={3}
          placeholder={"一行一點，例：\n免固網，插卡即可開通\n單條 PoE 供電＋回傳"}
          onChange={(e) => setBody(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-transparent p-2 text-xs"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          印在圖片右邊。一行一個列點，最多 6 點；留空就只印小標。
        </p>
      </div>

      <Button
        size="sm"
        disabled={busy}
        onClick={() =>
          onSave({
            caption: caption.trim() || null,
            body: body
              .split("\n")
              .map((l) => l.replace(/^[-•*]\s*/, "").trim())
              .filter(Boolean),
            // A label with no text prints as an empty white box. Dropping it
            // here is what the author meant by leaving it blank.
            labels: labels.filter((l) => l.text.trim()),
          })
        }
      >
        {busy ? "儲存中…" : "儲存圖說與標註"}
      </Button>
    </div>
  );
}

/** Same offsets as the print layout, in px rather than pt. */
const OFFSET: Record<LabelSide, string> = {
  right: "translate(9px, -50%)",
  left: "translate(-100%, -50%) translateX(-9px)",
  top: "translate(-50%, -100%) translateY(-9px)",
  bottom: "translate(-50%, 0) translateY(9px)",
};

const SIDE_GLYPH: Record<LabelSide, string> = { right: "→", left: "←", top: "↑", bottom: "↓" };
const SIDE_LABEL: Record<LabelSide, string> = {
  right: "文字放右邊",
  left: "文字放左邊",
  top: "文字放上面",
  bottom: "文字放下面",
};

export const MODEL_SLOTS = [
  { value: "product", label: "封面主圖" },
  { value: "view", label: "硬體外觀" },
];

export const DOC_SLOTS = [{ value: "diagram", label: "應用情境圖" }];
