import { requirePagePermission } from "@eg/auth/page-guards";
import { GlossaryEditor } from "@/components/settings/glossary-editor";

export default async function GlossaryPage() {
  await requirePagePermission("settings.edit_glossary");
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <GlossaryEditor />
    </div>
  );
}
