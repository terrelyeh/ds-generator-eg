import { requirePagePermission } from "@eg/auth/page-guards";
import { TypographyEditor } from "@/components/settings/typography-editor";

export default async function TypographyPage() {
  await requirePagePermission("settings.edit_typography");
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <TypographyEditor />
    </div>
  );
}
