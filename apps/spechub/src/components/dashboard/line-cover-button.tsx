"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import type { ProductLine } from "@eg/db/types";
import { MAX_COVER_PHOTOS } from "@/lib/datasheet/cover-photo";

export { COVER_PHOTO_CATEGORIES } from "@/lib/datasheet/cover-photo";

/**
 * Manage the line's cover photographs: keep a shortlist, switch which prints.
 *
 * A panel rather than one replace-button, because choosing a cover is
 * comparative — you look at a few behind the real headline and keep the one
 * that works. With a single slot, seeing the next candidate means destroying
 * the last, and there is no way back.
 *
 * It also names the SOURCE in play. Orin Box has two: a file uploaded here,
 * and series_hero.png synced from Drive. The upload wins, and without saying
 * so a PM who uploads while a Drive file exists cannot tell which one they
 * are looking at.
 */
export function LineCoverButton({
  line,
  driveHero,
}: {
  line: ProductLine;
  /** line_datasheets.images.hero — Drive's copy, used when nothing is active. */
  driveHero?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const options = line.cover_hero_options ?? [];
  const active = line.cover_hero_image;
  const effective = active ?? driveHero ?? null;
  const source = active ? "uploaded" : driveHero ? "drive" : "none";

  /** Run a mutation, refresh, and keep error reporting in one place. */
  async function run(
    label: string,
    fn: () => Promise<Response>,
    success: string,
  ) {
    setBusy(true);
    const toastId = toast.loading(label);
    try {
      const res = await fn();
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success(success, { id: toastId });
      // The measurement is a nudge, not a verdict, so it gets its own
      // longer-lived toast instead of replacing the success message.
      if (json.warning) toast.warning(json.warning, { duration: 12000 });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared immediately: picking the same file twice in a row fires no
    // change event otherwise, and the retry looks like a dead button.
    e.target.value = "";
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("line_id", line.id);
    void run(
      `Uploading cover for ${line.label}…`,
      () => fetch("/api/line-cover", { method: "POST", body }),
      `${line.label} 封面照已更新`,
    );
  }

  const activate = (url: string) =>
    run(
      "切換封面照…",
      () =>
        fetch("/api/line-cover", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ line_id: line.id, url }),
        }),
      "已切換封面照",
    );

  /**
   * Removing drops the Storage object too, so this is the one control here
   * that destroys something. It was a single click, on a 16px target, next
   * to the thumbnails you click to SWITCH — and the first person to use the
   * panel lost a photo to it. The recovery only existed because the source
   * file happened to still be sitting in a scratch directory.
   *
   * window.confirm rather than a dialog component: it matches how the rest
   * of the app asks (project-row-actions, glossary-editor), and a modal for
   * one line of text inside a popover is more machinery than the question
   * deserves.
   */
  function confirmRemove(url: string) {
    const isActive = url === active;
    const others = options.filter((o) => o !== url).length;
    const consequence = isActive
      ? others > 0
        ? "它正在使用中，封面會改用清單裡剩下的第一張。"
        : driveHero
          ? "它正在使用中，封面會退回 Drive 同步的那張。"
          : "它正在使用中，封面會變回純色底。"
      : "";
    if (!window.confirm(`移除這張封面照？檔案會一併刪掉，救不回來。${consequence}`)) return;
    void remove(url);
  }

  const remove = (url: string) =>
    run(
      "移除…",
      () =>
        fetch(
          `/api/line-cover?line_id=${encodeURIComponent(line.id)}&url=${encodeURIComponent(url)}`,
          { method: "DELETE" },
        ),
      "已移除",
    );

  return (
    <span className="relative inline-flex items-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={upload}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={
          source === "uploaded"
            ? `封面照（${options.length}/${MAX_COVER_PHOTOS} 張）`
            : source === "drive"
              ? "目前用 Drive 同步的 series_hero"
              : "這條線的封面目前是純色底"
        }
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        {effective ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={effective} alt="" className="h-3.5 w-5 rounded-[2px] object-cover" />
        ) : (
          <ImageIcon className="h-3.5 w-3.5" />
        )}
        Cover Photo
        {source === "drive" && (
          <span className="text-[10px] text-muted-foreground/70">(Drive)</span>
        )}
        {options.length > 1 && (
          <span className="text-[10px] text-muted-foreground/70">{options.length}</span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away. Behind the panel, ahead of the page. */}
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span className="absolute left-0 top-full z-50 block w-[420px] rounded-md border border-border bg-popover p-2.5 shadow-lg mt-1.5">
            <span className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-foreground">{line.label} 封面照</span>
              <span className="text-[10px] text-muted-foreground">
                {options.length}/{MAX_COVER_PHOTOS} · 點縮圖切換
              </span>
            </span>

            <span className="flex gap-2">
              {options.map((url) => {
                const isActive = url === active;
                return (
                  <span key={url} className="relative block flex-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => !isActive && activate(url)}
                      title={isActive ? "使用中" : "改用這張"}
                      className={`block w-full overflow-hidden rounded border-2 transition-colors disabled:opacity-50 ${
                        isActive
                          ? "border-engenius-blue"
                          : "border-transparent hover:border-muted-foreground/40"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="block aspect-[2/1] w-full object-cover" />
                    </button>
                    {isActive && (
                      <span className="pointer-events-none absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-engenius-blue">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => confirmRemove(url)}
                      title="移除這張（檔案會一併刪掉）"
                      className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-[11px] leading-none text-white/80 transition-colors hover:bg-destructive hover:text-white disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                );
              })}

              {options.length < MAX_COVER_PHOTOS && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  title="上傳一張"
                  className="flex aspect-[2/1] flex-1 flex-col items-center justify-center gap-1 rounded border border-dashed border-border text-muted-foreground transition-colors hover:border-muted-foreground/60 hover:text-foreground disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-[10px]">上傳</span>
                </button>
              )}
            </span>

            <span className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[10px] leading-tight text-muted-foreground">
                {source === "uploaded"
                  ? "使用中的是上傳的照片"
                  : source === "drive"
                    ? "目前用 Drive 的 series_hero — 上傳一張會蓋過它"
                    : "沒有照片，封面印純色底"}
              </span>
              {effective && (
                <a
                  href={effective}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[10px] font-medium text-engenius-blue hover:underline"
                >
                  開原圖 ↗
                </a>
              )}
            </span>

            <span className="mt-2 block border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
              主體放左邊、右側留白 —— 標題壓在左側，產品渲染圖浮在右側。上傳後會量文字區的亮度，太亮會提醒（不會擋）。
            </span>
          </span>
        </>
      )}
    </span>
  );
}
