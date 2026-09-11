"use client";

import { useState } from "react";
import { citedFigures, type FigureSource } from "@/lib/ask/figures";

/**
 * Images from the sources an answer cited, under the answer. Shared by both
 * chat surfaces (ask-chat and engenie-chat). Render it only once the answer
 * has finished streaming — until then the set of citations isn't final.
 *
 * Plain <img>, never inline SVG: an SVG drawn as an image cannot run script,
 * and these URLs come from indexed content.
 */
export function AnswerFigures({ content, sources }: { content: string; sources?: FigureSource[] }) {
  const figures = citedFigures(content, sources);
  // An external screenshot that has since moved should vanish, not leave a
  // broken-image icon in the answer.
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const visible = figures.filter((f) => !broken.has(f.url));
  if (visible.length === 0) return null;

  const single = visible.length === 1;
  return (
    <div className={`mt-3 grid max-w-[46rem] gap-2 ${single ? "grid-cols-1" : "grid-cols-2"}`}>
      {visible.map((f) => (
        <a
          key={f.url}
          href={f.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`[${f.citation}] ${f.sourceTitle}`}
          className="group block overflow-hidden rounded-lg border border-black/10 bg-white transition-shadow hover:shadow-md dark:border-white/10 dark:bg-slate-900"
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
        </a>
      ))}
    </div>
  );
}
