import { adminOnly } from "@/lib/auth/page-guards";
import { PersonasEditor } from "@/components/settings/personas-editor";

export default async function PersonasPage() {
  await adminOnly();
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <PersonasEditor />
    </div>
  );
}
