import { adminOnly } from "@/lib/auth/page-guards";
import { TypographyEditor } from "@/components/settings/typography-editor";

export default async function TypographyPage() {
  await adminOnly();
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <TypographyEditor />
    </div>
  );
}
