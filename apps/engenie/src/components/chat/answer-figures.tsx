"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Image as ImageIcon, X, ZoomIn, ZoomOut } from "lucide-react";
import { asksForVisuals, citedFigures, type AnswerFigure, type FigureSource } from "@/lib/ask/figures";

/**
 * Images from the sources an answer cited, under the answer — folded behind
 * 「相關圖片（N）」unless the question asked for something visual. Shared by both
 * chat surfaces (ask-chat and engenie-chat). Render it only once the answer
 * has finished streaming — until then the set of citations isn't final.
 *
 * Plain <img>, never inline SVG: an SVG drawn as an image cannot run script,
 * and these URLs come from indexed content.
 *
 * Clicking opens an in-page viewer, not the image URL. Supabase Storage serves
 * SVGs with `Content-Disposition: attachment` and a sandbox CSP (so they can't
 * script on its domain) — opening one in a tab downloads it, which is what the
 * internal-doc diagrams did. An <img> ignores that header, so the viewer shows
 * the same URL fitted, with click-to-zoom for diagrams too dense to read in a
 * side panel.
 */
export function AnswerFigures({
  content,
  sources,
  question,
}: {
  content: string;
  sources?: FigureSource[];
  /** The user's question — figures open by default only when it asked for something visual. */
  question?: string;
}) {
  const figures = citedFigures(content, sources);
  // An external screenshot that has since moved should vanish, not leave a
  // broken-image icon in the answer.
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(() => asksForVisuals(question));
  const visible = figures.filter((f) => !broken.has(f.url));
  if (visible.length === 0) return null;

  const single = visible.length === 1;
  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        相關圖片（{visible.length}）
        <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className={`mt-2 grid max-w-[46rem] gap-2 ${single ? "grid-cols-1" : "grid-cols-2"}`}>
          {visible.map((f, i) => (
            <button
              key={f.url}
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`放大檢視：[${f.citation}] ${f.sourceTitle}`}
              className="group block cursor-zoom-in overflow-hidden rounded-lg border border-black/10 bg-white text-left transition-shadow hover:shadow-md dark:border-white/10 dark:bg-slate-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={f.sourceTitle}
                loading="lazy"
                onError={() => setBroken((prev) => new Set(prev).add(f.url))}
                className={`block h-auto w-full bg-slate-50 object-contain dark:bg-slate-800 ${single ? "max-h-[28rem]" : "max-h-60"}`}
              />
              <span className="flex items-center gap-1.5 border-t border-black/5 px-2.5 py-1.5 text-[11px] text-slate-500 dark:border-white/5 dark:text-slate-400">
                <span className="font-medium text-slate-600 dark:text-slate-300">[{f.citation}]</span>
                <span className="truncate">{f.sourceTitle}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {openIndex !== null && visible[openIndex] && (
        <FigureViewer figures={visible} index={openIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
}

/**
 * Full-panel viewer. Rendered into document.body through a portal: the chat
 * rows carry enter animations, and a transformed ancestor would turn
 * `position: fixed` into "fixed to that row".
 */
function FigureViewer({
  figures,
  index,
  onIndex,
  onClose,
}: {
  figures: AnswerFigure[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [natural, setNatural] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const f = figures[index];
  const many = figures.length > 1;

  const go = useCallback(
    (step: number) => {
      setZoomed(false);
      onIndex((index + step + figures.length) % figures.length);
    },
    [index, figures.length, onIndex],
  );

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (many && e.key === "ArrowRight") go(1);
      else if (many && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go, many]);

  const toggleZoom = () => setZoomed((z) => !z);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={f.sourceTitle}
      className="fixed inset-0 z-[100] flex flex-col bg-black/85"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-white/80"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate">
          [{f.citation}] {f.sourceTitle}
          {many && <span className="ml-2 tabular-nums text-white/50">{index + 1} / {figures.length}</span>}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={zoomed ? "縮小到視窗大小" : "放大到原尺寸"}
            className="rounded-md p-1.5 transition-colors hover:bg-white/10"
          >
            {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="rounded-md p-1.5 transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        className={`relative min-h-0 flex-1 px-3 pb-3 ${zoomed ? "overflow-auto overscroll-contain" : "flex items-center justify-center overflow-hidden"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={f.url}
          src={f.url}
          alt={f.sourceTitle}
          onLoad={(e) => setNatural(e.currentTarget.naturalWidth)}
          onClick={(e) => {
            e.stopPropagation();
            toggleZoom();
          }}
          // Zoomed = the file's own width (dense diagrams are only legible at
          // full size), or 2.5× the panel when it doesn't say — an SVG with
          // only a viewBox reports a nominal naturalWidth.
          style={zoomed ? { width: `max(${natural}px, 250%)`, maxWidth: "none" } : undefined}
          className={`rounded-md bg-white ${zoomed ? "cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"}`}
        />
        {many && !zoomed && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label="上一張"
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition-colors hover:bg-black/75"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label="下一張"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition-colors hover:bg-black/75"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
