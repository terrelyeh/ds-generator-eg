"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  BookOpen,
  Building2,
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  Globe,
  Headphones,
  LifeBuoy,
  Loader2,
  Package,
  Radio,
  StickyNote,
} from "lucide-react";
import { groupSources, sourceHref, type ActivitySource } from "@/lib/ask/activity";

/**
 * What an answer is doing and what it found — shared by both chat surfaces
 * (ask-chat and engenie-chat).
 *
 * While waiting it shows the steps the server actually streams: the search,
 * the sources it found (they arrive before the model starts writing), then
 * the writing, with an elapsed timer. Retrieval is one search and the model
 * reads everything at once, so there is no "reading source 3 of 8" to show,
 * and this doesn't invent one.
 *
 * Once text arrives the trace folds into one line above the answer, "參考了
 * N 則資料" — the answer's source list, which used to sit under it.
 */

const TYPE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  product_spec: Package,
  gitbook: BookOpen,
  helpcenter: LifeBuoy,
  google_doc: FileText,
  wifi_regulation: Radio,
  web: Globe,
  text_snippet: StickyNote,
  file: FileText,
  vertical_guide: Building2,
  support: Headphones,
  internal_doc: FolderOpen,
};

const PREVIEW_COUNT = 4;

function TypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] ?? FileText;
  return <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />;
}

/** The EnGenie spark. `active` = an answer is on its way, so it turns. */
export function EngenieSpark({ active = false, size = 16 }: { active?: boolean; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 ${active ? "engenie-spark-active" : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="6 3.8 44 44">
        <path d="M28 6 L31.4 22.4 L47 25.8 L31.4 29.2 L28 45.6 L24.6 29.2 L9 25.8 L24.6 22.4 Z" fill="#03a9f4" />
      </svg>
      <style>{`
        @keyframes engenieSpark {
          0% { transform: rotate(0deg) scale(0.86); opacity: 0.7; }
          50% { transform: rotate(45deg) scale(1.08); opacity: 1; }
          100% { transform: rotate(90deg) scale(0.86); opacity: 0.7; }
        }
        .engenie-spark-active { animation: engenieSpark 1.4s ease-in-out infinite; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) { .engenie-spark-active { animation: none; } }
      `}</style>
    </span>
  );
}

interface AnswerActivityProps {
  sources?: ActivitySource[];
  status: "searching" | "generating" | null;
  isStreaming?: boolean;
  hasContent: boolean;
  /** Show the answer's [n] per item — ask-chat renders citations, engenie-chat strips them. */
  showCitations?: boolean;
  /** Link titles to paths on this app — only where the reader has an EnGenie login (see sourceHref). */
  allowRelativeLinks?: boolean;
}

export function AnswerActivity(props: AnswerActivityProps) {
  if (props.isStreaming && !props.hasContent) return <LiveTrace {...props} />;
  return <SourcesToggle {...props} />;
}

function Step({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function LiveTrace({ sources, status }: AnswerActivityProps) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const found = sources !== undefined;
  const groups = groupSources(sources);

  return (
    <div className="space-y-1.5 py-1 text-[13px] text-muted-foreground" role="status" aria-live="polite">
      <Step
        icon={found ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      >
        搜尋知識庫
      </Step>
      {found && (
        <Step icon={<Check className="h-3.5 w-3.5 text-emerald-600" />}>
          {groups.length > 0 ? `找到 ${groups.length} 則相關資料` : "沒有找到直接相關的資料"}
        </Step>
      )}
      {groups.length > 0 && (
        <ul className="ml-2 space-y-1 border-l border-border pl-3.5 text-[12.5px]">
          {groups.slice(0, PREVIEW_COUNT).map((g, i) => (
            <li
              key={g.key}
              className="flex min-w-0 items-center gap-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300"
              style={{ animationDelay: `${i * 90}ms`, animationFillMode: "both" }}
            >
              <TypeIcon type={g.sourceType} />
              <span className="truncate">{g.title}</span>
            </li>
          ))}
          {groups.length > PREVIEW_COUNT && (
            <li className="text-muted-foreground/70">還有 {groups.length - PREVIEW_COUNT} 則</li>
          )}
        </ul>
      )}
      {found && status === "generating" && (
        <Step icon={<EngenieSpark active size={14} />}>
          整理回覆中…
          {elapsed >= 1 && <span className="ml-1.5 tabular-nums text-muted-foreground/70">{elapsed}s</span>}
        </Step>
      )}
    </div>
  );
}

function SourcesToggle({ sources, showCitations = false, allowRelativeLinks = false }: AnswerActivityProps) {
  const [open, setOpen] = useState(false);
  const groups = groupSources(sources);
  if (groups.length === 0) return null;

  return (
    <div className="mb-3 text-[13px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        參考了 {groups.length} 則資料
      </button>
      {open && (
        <ul className="ml-2 mt-1.5 space-y-1 border-l border-border pl-3.5 text-[12.5px] text-muted-foreground">
          {groups.map((g) => {
            const href = sourceHref(g.url, g.sourceType, { allowRelative: allowRelativeLinks });
            const label = (
              <>
                {showCitations && (
                  <span className="shrink-0 tabular-nums opacity-70">{g.citations.map((n) => `[${n}]`).join("")}</span>
                )}
                <TypeIcon type={g.sourceType} />
                <span className="truncate">{g.title}</span>
              </>
            );
            return (
              <li key={g.key} className="flex min-w-0 items-center gap-1.5">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-engenius-blue"
                  >
                    {label}
                  </a>
                ) : (
                  label
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
