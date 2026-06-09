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

  return (
    <EngenieGate workspace={ws.slug} title={ws.name} subtitle="EnGenius Knowledge Assistant">
      <EngenieShell workspace={ws.slug} title={ws.name} />
    </EngenieGate>
  );
}
