import { adminOnly } from "@/lib/auth/page-guards";
import { ApiKeysEditor } from "@/components/settings/api-keys-editor";

export default async function ApiKeysPage() {
  await adminOnly();
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <ApiKeysEditor />
    </div>
  );
}
