import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createAdminClient } from "@eg/db/admin";
import { requirePagePermission } from "@eg/auth/page-guards";
import { can } from "@eg/auth/permissions";
import { loadDoc, safeDecode, VIEWABLE_SOURCE_TYPES } from "@/lib/rag/doc-view";

export const dynamic = "force-dynamic";

/**
 * In-app viewer for knowledge that lives in our own store — internal doc
 * packages, support articles, text snippets, uploaded files.
 *
 * This is what their citations link to. Sources indexed from somewhere public
 * (gitbook, help centre, google docs, vertical guides) keep their own http URL
 * and never reach this page; `wifi_regulation` has its own viewer already.
 *
 * URL: /knowledge/doc/<source_type>/<source_id…>  — the id may contain "/"
 * (internal-doc ids are path-shaped), hence the catch-all.
 */

const LABELS: Record<string, { icon: string; label: string }> = {
  internal_doc: { icon: "🗂️", label: "Internal Doc" },
  support: { icon: "🎧", label: "Support Knowledge" },
  text_snippet: { icon: "📝", label: "Text Snippet" },
};

const PROSE =
  "prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-xl prose-h1:mb-3 prose-h2:mt-6 prose-h2:mb-2 prose-h2:text-base prose-h3:text-sm prose-h3:mt-4 prose-table:my-3 prose-table:text-xs prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

/** Uploaded files are not markdown — hand back a short-lived signed URL instead. */
async function redirectToStoredFile(sourceId: string): Promise<never> {
  const supabase = createAdminClient();
  const { data: row } = (await supabase
    .from("documents" as "products")
    .select("metadata")
    .eq("source_type", "file")
    .eq("source_id", sourceId)
    .eq("chunk_index", 0)
    .maybeSingle()) as { data: { metadata: Record<string, unknown> | null } | null };

  const path = row?.metadata?.storage_path as string | undefined;
  if (!path) notFound();

  const { data } = await supabase.storage.from("knowledge-files").createSignedUrl(path, 60);
  if (!data?.signedUrl) notFound();
  redirect(data.signedUrl);
}

export default async function KnowledgeDocPage({ params }: PageProps) {
  // ask.use, not knowledge.view: this is where citations lead, and viewers
  // can use Ask — so they are shown these citations — without having
  // knowledge.view. Gating on the stricter one bounced them off every link.
  // Redirects on failure (it does not return an element).
  const user = await requirePagePermission("ask.use");
  const canBrowse = can(user.role, "knowledge.view");

  const { slug } = await params;
  const [sourceType, ...idParts] = slug.map(safeDecode);
  const sourceId = idParts.join("/");
  if (!sourceType || !sourceId) notFound();

  if (sourceType === "file") await redirectToStoredFile(sourceId);

  if (!(VIEWABLE_SOURCE_TYPES as readonly string[]).includes(sourceType)) notFound();

  const doc = await loadDoc(sourceType, sourceId);
  if (!doc) notFound();

  const badge = LABELS[sourceType] ?? { icon: "📄", label: sourceType };
  const collection = typeof doc.metadata.collection === "string" ? doc.metadata.collection : null;
  const version = typeof doc.metadata.version === "string" ? doc.metadata.version : null;
  const status = typeof doc.metadata.status === "string" ? doc.metadata.status : null;
  const path = typeof doc.metadata.path === "string" ? doc.metadata.path : null;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={canBrowse ? "/knowledge" : "/ask"}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 12L6 8l4-4" />
            </svg>
            {canBrowse ? "Knowledge Base" : "Ask"}
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-engenius-blue/10 px-2.5 py-1 text-[11px] font-medium text-engenius-blue">
            <span>{badge.icon}</span>
            <span>{badge.label}</span>
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-engenius-dark dark:text-white">
          {doc.title}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
          {collection && <span className="font-mono">{collection}</span>}
          {version && <span>v{version}</span>}
          {/* A draft that reads like a decision is the whole risk with this
              material, so the status is stated on the page, not just in metadata. */}
          {status && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {status}
            </span>
          )}
          {path && <span className="font-mono opacity-60">{path}</span>}
        </div>

        {doc.reconstructed && (
          <p className="mt-4 rounded-md border border-dashed border-muted-foreground/25 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
            這份是<strong>從索引片段重組</strong>的閱讀版本 —— 它是被檢索到的內容，但片段接縫處可能有重複或斷裂，不等於原始檔逐字重現。重新索引之後就會顯示原文。
          </p>
        )}

        <article className={`mt-6 ${PROSE}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.markdown}</ReactMarkdown>
        </article>

        <footer className="mt-10 border-t pt-4 text-[11px] text-muted-foreground/60">
          <span className="font-mono">{doc.sourceType}</span> · <span className="font-mono">{doc.sourceId}</span>
        </footer>
      </div>
    </div>
  );
}
