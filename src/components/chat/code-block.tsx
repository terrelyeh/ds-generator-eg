"use client";

import { useState, isValidElement, type ReactNode, type ReactElement } from "react";

/**
 * Shared fenced-code-block renderer for both Ask surfaces (desktop panel +
 * EnGenie demo). Used as the `pre` override in react-markdown so every code
 * block gets a ChatGPT/Claude-style header: language label on the left, a
 * one-click Copy button on the right, and a dark body. Token colours come from
 * the highlight.js github-dark theme (imported in globals.css) via
 * rehype-highlight; layout/background is owned by `.chat-codeblock` CSS so it's
 * consistent regardless of the surrounding `prose` / `.ask-markdown` styles.
 */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);

  const codeEl = findCodeElement(children);
  const className = (codeEl?.props?.className as string) ?? "";
  const lang = /language-(\w+)/.exec(className)?.[1] ?? "";
  const text = extractText(codeEl?.props?.children);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="chat-codeblock group/code my-4 overflow-hidden rounded-lg border border-black/15">
      <div className="flex items-center justify-between bg-[#0d1117] px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-slate-100"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="chat-pre">{children}</pre>
    </div>
  );
}

type ChildProps = { className?: string; children?: ReactNode };

function findCodeElement(node: ReactNode): ReactElement<ChildProps> | null {
  if (isValidElement(node)) return node as ReactElement<ChildProps>;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findCodeElement(n);
      if (found) return found;
    }
  }
  return null;
}

function extractText(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    return extractText((node.props as ChildProps).children);
  }
  return "";
}
