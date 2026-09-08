"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { ProductLine } from "@eg/db/types";

/**
 * The categories whose datasheet opens on a photograph. Layouts A and C
 * draw a colour field, so for those lines this control would offer a
 * setting that changes nothing.
 *
 * Kept beside the button rather than imported from the API route: a client
 * component pulling from a route module drags server-only code into the
 * bundle. Both lists are short and both are named in the same PR; the API
 * refuses anything else regardless, so a drift here shows a button that
 * cannot save, not a photo that silently vanishes.
 */
export const COVER_PHOTO_CATEGORIES = new Set([
  "Edge Network Appliances",
  "AI Servers",
  "Edge AI Computers",
]);

/**
 * Set or clear the line's full-bleed cover photograph.
 *
 * Shows which source the datasheet is actually drawing, because Orin Box
 * has two: an uploaded file here, and series_hero.png synced from Drive.
 * This one wins. Without saying so, a PM who uploads while a Drive file
 * exists has no way to tell which one they are looking at.
 */
export function LineCoverButton({
  line,
  driveHero,
}: {
  line: ProductLine;
  /** line_datasheets.images.hero — Drive's copy, used when nothing is uploaded. */
  driveHero?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const uploaded = line.cover_hero_image;
  const effective = uploaded ?? driveHero ?? null;
  const source = uploaded ? "uploaded" : driveHero ? "drive" : "none";

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear immediately: without this, picking the same file twice in a row
    // fires no change event and the retry looks like a dead button.
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    const toastId = toast.loading(`Uploading cover for ${line.label}…`);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("line_id", line.id);
      const res = await fetch("/api/line-cover", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      toast.success(`${line.label} 封面照已更新`, { id: toastId });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    const toastId = toast.loading(`Removing cover for ${line.label}…`);
    try {
      const res = await fetch(`/api/line-cover?line_id=${encodeURIComponent(line.id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success(
        driveHero
          ? `已移除上傳的封面照，改用 Drive 的 series_hero`
          : `${line.label} 封面照已移除，封面改回純色底`,
        { id: toastId },
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="group relative inline-flex items-center gap-1">
      {/* Hover preview. The button's thumbnail is 5x3.5pt — enough to say
          "there is one", not enough to say WHICH one, and the only other way
          to look was to open the datasheet. Rendered on hover rather than
          behind a click because checking the photo is something people do
          while doing something else. */}
      {effective && (
        <span className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden group-hover:block">
          <span className="pointer-events-auto block rounded-md border border-border bg-popover p-1.5 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={effective}
              alt={`${line.label} cover photo`}
              className="block h-auto w-[280px] rounded-[3px] object-contain"
            />
            <span className="mt-1.5 flex items-center justify-between gap-3 px-0.5">
              <span className="text-[10px] text-muted-foreground">
                {source === "uploaded" ? "已上傳" : "Drive 同步"}
              </span>
              <a
                href={effective}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-medium text-engenius-blue hover:underline"
              >
                開原圖 ↗
              </a>
            </span>
          </span>
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={upload}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title={
          source === "uploaded"
            ? "封面照（已上傳）— 點擊更換"
            : source === "drive"
              ? "目前用 Drive 同步的 series_hero — 上傳一張會蓋過它"
              : "這條線的 datasheet 封面目前是純色底 — 上傳一張照片"
        }
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        {effective ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={effective}
            alt=""
            className="h-3.5 w-5 rounded-[2px] object-cover"
          />
        ) : (
          <ImageIcon className="h-3.5 w-3.5" />
        )}
        Cover Photo
        {source === "drive" && (
          <span className="text-[10px] text-muted-foreground/70">(Drive)</span>
        )}
      </button>
      {uploaded && (
        <button
          type="button"
          disabled={busy}
          onClick={clear}
          title="移除上傳的封面照"
          className="rounded px-1 text-xs text-muted-foreground/60 hover:text-destructive transition-colors disabled:opacity-50"
        >
          ×
        </button>
      )}
    </span>
  );
}
