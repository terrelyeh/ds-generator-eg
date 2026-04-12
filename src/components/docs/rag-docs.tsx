"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function RagDocs({ content }: { content: string }) {
  return (
    <div className="rag-docs">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>

      <style jsx global>{`
        .rag-docs { font-size: 14px; line-height: 1.7; color: #2C3345; }
        .rag-docs h1 { font-size: 28px; font-weight: 700; color: #0288d1; border-bottom: 3px solid #03a9f4; padding-bottom: 12px; margin-bottom: 8px; }
        .rag-docs h2 { font-size: 20px; font-weight: 700; margin-top: 40px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e5e9; }
        .rag-docs h3 { font-size: 16px; font-weight: 600; color: #58595B; margin-top: 28px; margin-bottom: 8px; }
        .rag-docs h4 { font-size: 14px; font-weight: 600; margin-top: 20px; margin-bottom: 6px; }
        .rag-docs p { margin: 8px 0; }
        .rag-docs ul, .rag-docs ol { margin: 8px 0 8px 24px; }
        .rag-docs li { margin: 4px 0; }
        .rag-docs blockquote { border-left: 3px solid #03a9f4; padding-left: 16px; color: #6f6f6f; margin: 12px 0; font-style: italic; }
        .rag-docs code { background: #f0f1f3; padding: 1px 5px; border-radius: 3px; font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace; }
        .rag-docs pre { background: #1e293b; color: #e2e8f0; padding: 16px 20px; border-radius: 8px; overflow-x: auto; font-size: 13px; line-height: 1.5; margin: 12px 0; }
        .rag-docs pre code { background: none; padding: 0; color: inherit; }
        .rag-docs table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
        .rag-docs th { background: #f8f9fa; text-align: left; padding: 8px 12px; font-weight: 600; border: 1px solid #e2e5e9; font-size: 12px; }
        .rag-docs td { padding: 8px 12px; border: 1px solid #e2e5e9; vertical-align: top; }
        .rag-docs strong { font-weight: 600; }
        .rag-docs hr { border: none; border-top: 1px solid #e2e5e9; margin: 24px 0; }
      `}</style>
    </div>
  );
}
