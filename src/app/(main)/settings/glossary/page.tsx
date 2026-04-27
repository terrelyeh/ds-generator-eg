import { adminOnly } from "@/lib/auth/page-guards";
import { GlossaryEditor } from "@/components/settings/glossary-editor";

export default async function GlossaryPage() {
  await adminOnly();
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <GlossaryEditor />
    </div>
  );
}
