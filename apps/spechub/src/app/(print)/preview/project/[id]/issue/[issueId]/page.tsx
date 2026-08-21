import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@eg/db/admin";
import { getCurrentUser } from "@eg/auth/session";
import { can } from "@eg/auth/permissions";
import { ProjectPreview } from "../../project-preview";
import { printTitle } from "@/lib/project-datasheet/filename";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

export const dynamic = "force-dynamic";

/**
 * One past issue, exactly as it was sent.
 *
 * Reads the stored snapshot and nothing else — no join back to the live rows,
 * because the whole point is that the live rows have moved on. The renderer
 * takes `{doc, models}` as props, so replaying is passing the snapshot back
 * in unchanged.
 *
 * No toolbar: this is a record, not a draft. Printing it again would record a
 * new issue of a document nobody edited, which would make the history lie.
 */
/**
 * Names the file after the ISSUE, not after today — a saved copy of issue 3
 * should not land in Downloads carrying the date somebody happened to open
 * it, next to the file that was actually sent that day.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; issueId: string }>;
}): Promise<Metadata> {
  const { id, issueId } = await params;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("project_datasheet_issues")
      .select("issue_no, issued_at, snapshot")
      .eq("id", issueId)
      .eq("project_datasheet_id", id)
      .maybeSingle();
    const row = data as {
      issue_no: number;
      issued_at: string;
      snapshot: { doc?: { name?: string } } | null;
    } | null;
    const name = row?.snapshot?.doc?.name;
    if (name) {
      return { title: printTitle({ name }, new Date(row.issued_at), row.issue_no) };
    }
  } catch {
    // A title is not worth failing a page render over.
  }
  return { title: "Project datasheet — issue" };
}

export default async function IssuePage({
  params,
}: {
  params: Promise<{ id: string; issueId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "project_datasheet.view")) notFound();

  const { id, issueId } = await params;
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("project_datasheet_issues")
    .select("snapshot, issue_no, issued_at, issued_by_email")
    .eq("id", issueId)
    .eq("project_datasheet_id", id)
    .maybeSingle();

  if (!data) notFound();

  const snapshot = (data as { snapshot: unknown }).snapshot as {
    doc?: ProjectDatasheet;
    models?: ProjectDatasheetModel[];
  } | null;

  // A snapshot that cannot be read is a broken record, not an empty document.
  // Rendering a blank datasheet here would look like the issue really was
  // blank, which is worse than saying the record is unreadable.
  if (!snapshot?.doc) notFound();

  const meta = data as { issue_no: number; issued_at: string; issued_by_email: string | null };

  return (
    <>
      <div className="issue-bar">
        第 {meta.issue_no} 版 · 出圖於 {meta.issued_at.slice(0, 10)}
        {meta.issued_by_email ? ` · ${meta.issued_by_email}` : ""} · 此為存檔內容，不可編輯
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.issue-bar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  background: #4b3a12; color: #fde68a; font-family: system-ui, sans-serif;
  font-size: 12px; padding: 8px 20px;
}
@media print { .issue-bar { display: none !important; } }
`,
        }}
      />
      <ProjectPreview doc={snapshot.doc} models={snapshot.models ?? []} showToolbar={false} />
    </>
  );
}
