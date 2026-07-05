"use client";

import { Component, type ReactNode } from "react";

/**
 * Guards the markdown renderer: if ReactMarkdown/rehype throws on a malformed
 * LLM answer, degrade THAT message to plain text instead of white-screening
 * the whole chat surface. Class component — error boundaries have no hook
 * equivalent. Once a message trips the boundary it stays in plain-text mode
 * (the fallback prop still updates, so a streaming answer keeps flowing as
 * raw text); the next message renders through a fresh boundary as usual.
 */
export class MarkdownErrorBoundary extends Component<
  { fallback: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <pre className="whitespace-pre-wrap font-sans text-sm">{this.props.fallback}</pre>;
    }
    return this.props.children;
  }
}
