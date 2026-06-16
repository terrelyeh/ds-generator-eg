import { adminOnly } from "@eg/auth/page-guards";
import { AskWelcomeEditor } from "@/components/settings/ask-welcome-editor";

export default async function AskWelcomePage() {
  await adminOnly();
  return (
    <div className="mx-auto max-w-[1265px] px-6 py-8">
      <AskWelcomeEditor />
    </div>
  );
}
