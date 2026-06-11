import { notFound } from "next/navigation";
import { EngenieGate } from "@/components/demo/engenie-gate";
import { EngenieShell } from "@/components/demo/engenie-shell";
import { loadWorkspaceBySlug } from "@/lib/ask/workspaces";

/**
 * Per-department workspace Ask entry: /ask/<slug>.
 * Passcode gate (workspace-specific) → EnGenie chat shell wired to workspace
 * mode (scoped knowledge + the workspace's LLM key/quota).
 */
export default async function WorkspaceAskPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ws = await loadWorkspaceBySlug(slug);
  if (!ws || !ws.enabled) notFound();

  // A BYOK workspace with no key can't generate — show a clear notice instead
  // of a chat box that silently fails on the first message.
  const notReady = ws.llm_mode === "byok" && !ws.byok_key_encrypted;

  return (
    <EngenieGate workspace={ws.slug} title={ws.name} subtitle="EnGenius Knowledge Assistant">
      {notReady ? (
        <WorkspaceNotReady title={ws.name} />
      ) : (
        <EngenieShell workspace={ws.slug} title={ws.name} />
      )}
    </EngenieGate>
  );
}

function WorkspaceNotReady({ title }: { title: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#faf9f5] px-6 text-center">
      <div className="max-w-[360px]">
        <h1 className="font-heading text-[22px] font-bold tracking-tight text-engenius-dark">{title}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-engenius-gray">
          這個工作區尚未設定完成（已選 BYOK 模式但未填入 API key），暫時無法使用。
          <br />
          請聯絡管理員完成設定。
        </p>
      </div>
    </div>
  );
}
