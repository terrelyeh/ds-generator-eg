"use client";

import { isValidElement, type ReactNode, type ReactElement } from "react";
import { CodeBlock } from "./code-block";
import { TopologyDiagram } from "./topology-diagram";

/**
 * react-markdown `pre` override for chat surfaces: a ```topology fenced block
 * renders as a TopologyDiagram; everything else is a normal CodeBlock.
 */

type ChildProps = { className?: string; children?: ReactNode };

function findCode(node: ReactNode): ReactElement<ChildProps> | null {
  if (isValidElement(node)) return node as ReactElement<ChildProps>;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findCode(n);
      if (f) return f;
    }
  }
  return null;
}

function textOf(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as ChildProps).children);
  return "";
}

export function ChatPre({ children }: { children?: ReactNode }) {
  const code = findCode(children);
  const className = (code?.props?.className as string) ?? "";
  const lang = /language-(\w+)/.exec(className)?.[1];
  if (lang === "topology") {
    return <TopologyDiagram source={textOf(code?.props?.children).trim()} />;
  }
  return <CodeBlock>{children}</CodeBlock>;
}
