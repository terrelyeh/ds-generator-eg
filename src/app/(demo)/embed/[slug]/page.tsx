import { notFound } from "next/navigation";
import { EngenieEmbed } from "@/components/demo/engenie-embed";
import { loadWorkspaceBySlug } from "@/lib/ask/workspaces";

/**
 * Embeddable widget target: /embed/<slug>. Loaded inside an iframe by widget.js
 * on a third-party site. Uses token (bearer) auth instead of cookies because
 * cross-site iframe cookies are blocked. Full-bleed, no app chrome.
 */
export default async function EmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ws = await loadWorkspaceBySlug(slug);
  if (!ws || !ws.enabled) notFound();

  const notReady = ws.llm_mode === "byok" && !ws.byok_key_encrypted;
  if (notReady) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#faf9f5] px-6 text-center">
        <p className="max-w-[320px] text-[13px] leading-relaxed text-engenius-gray">
          這個工作區尚未設定完成，暫時無法使用。請聯絡管理員。
        </p>
      </div>
    );
  }

  return <EngenieEmbed slug={ws.slug} title={ws.name} hasPasscode={!!ws.passcode_hash} />;
}
