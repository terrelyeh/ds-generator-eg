import { adminOnly } from "@eg/auth/page-guards";
import { PersonasEditor } from "@/components/settings/personas-editor";

export default async function PersonasPage() {
  await adminOnly();
  return (
    <div className="mx-auto max-w-[1265px] px-6 py-8">
      <PersonasEditor />
    </div>
  );
}
