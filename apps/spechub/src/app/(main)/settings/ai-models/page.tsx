import Link from "next/link";
import { requirePagePermission } from "@eg/auth/page-guards";
import { ProjectModelsEditor } from "@/components/settings/project-models-editor";

export const dynamic = "force-dynamic";

/**
 * Which model Tender Datasheets uses.
 *
 * Here rather than in EnGenie's Models page because that page is the CATALOG —
 * which models exist, what they are called, which surfaces offer them. This is
 * a choice among them for one feature, and the person making it is looking at
 * the feature, not at the catalog.
 */
export default async function AiModelsPage() {
  await requirePagePermission("settings.edit_api_keys");

  return (
    <div className="mx-auto max-w-[900px] px-6 py-8">
      <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
        ← Settings
      </Link>
      <h1 className="mt-1 font-heading text-2xl font-semibold text-[#231f20]">
        Tender Datasheets 的 AI 模型
      </h1>
      <p className="mt-1 max-w-[640px] text-sm text-muted-foreground">
        這個模組有兩個步驟會呼叫 AI，各自可以挑不同的模型。改完立刻生效，
        不用重新部署。其他步驟（缺漏掃描、規格表合成、產生澄清訊息）都不用 AI。
      </p>

      <div className="mt-6">
        <ProjectModelsEditor />
      </div>
    </div>
  );
}
