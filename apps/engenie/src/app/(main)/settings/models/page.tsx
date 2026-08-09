import { requirePagePermission } from "@eg/auth/page-guards";
import { ModelsEditor } from "@/components/settings/models-editor";

export default async function ModelsPage() {
  // Same bar as API keys: a bad slug here breaks translation and Ask at
  // once, so it sits with whoever owns the credentials.
  await requirePagePermission("settings.edit_api_keys");
  return (
    <div className="mx-auto max-w-[1265px] px-6 py-8">
      <ModelsEditor />
    </div>
  );
}
