import fs from "fs";
import path from "path";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/docs/markdown-renderer";

export default function SyncDocsPage() {
  const filePath = path.join(process.cwd(), "docs", "sync-and-notifications.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Dashboard
        </Link>
      </div>
      <article className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-td:text-muted-foreground prose-th:text-foreground prose-li:text-muted-foreground prose-a:text-engenius-blue prose-code:text-engenius-blue prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:text-foreground prose-blockquote:text-muted-foreground prose-blockquote:border-engenius-blue/30">
        <MarkdownRenderer content={content} />
      </article>
    </div>
  );
}
