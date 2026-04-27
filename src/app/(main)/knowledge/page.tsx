import { requirePagePermission } from "@/lib/auth/page-guards";
import { KnowledgeBase } from "@/components/knowledge/knowledge-base";

export default async function KnowledgePage() {
  await requirePagePermission("knowledge.view");
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <KnowledgeBase />
    </div>
  );
}
