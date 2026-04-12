import fs from "fs";
import path from "path";
import { RagDocs } from "@/components/docs/rag-docs";

export default function RagDocsPage() {
  const filePath = path.join(process.cwd(), "docs", "rag-system.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <RagDocs content={content} />
    </div>
  );
}
