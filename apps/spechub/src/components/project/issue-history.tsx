"use client";

import { useEffect, useState } from "react";

type Issue = {
  id: string;
  issue_no: number;
  issued_at: string;
  issued_by_email: string | null;
  note: string | null;
};

/**
 * Every PDF made from this document, newest first.
 *
 * This is the answer to "what did we actually send them" — each row opens the
 * stored snapshot, not the document as it stands today. A tender sheet is a
 * commitment, and six weeks of edits later the live document is no longer
 * evidence of what the customer was shown.
 *
 * Fetched on mount rather than passed in from the server page: the list grows
 * every time somebody prints, and a page that only refreshes on navigation
 * would show a history missing the issue just made.
 */
export function IssueHistory({ docId, updatedAt }: { docId: string; updatedAt: string }) {
  const [issues, setIssues] = useState<Issue[] | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/projects/${docId}/issues`)
      .then((r) => r.json())
      .then((j) => {
        if (live) setIssues(Array.isArray(j.issues) ? j.issues : []);
      })
      .catch(() => {
        if (live) setIssues([]);
      });
    return () => {
      live = false;
    };
  }, [docId]);

  if (issues === null) {
    return <p className="text-xs text-muted-foreground">讀取出圖紀錄…</p>;
  }

  if (issues.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        還沒有出過圖。在預覽頁按「Print / Save as PDF」時會自動存一版。
      </p>
    );
  }

  const stale = new Date(updatedAt) > new Date(issues[0].issued_at);

  return (
    <div className="space-y-2">
      {stale && (
        <p className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          這份文件在最後一次出圖之後又改過。客戶手上那份是第 {issues[0].issue_no} 版，跟你現在編輯的內容不一樣。
        </p>
      )}
      <ul className="divide-y rounded-md border text-xs">
        {issues.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 px-2.5 py-2">
            <div className="min-w-0">
              <span className="font-medium tabular-nums text-[#231f20]">第 {i.issue_no} 版</span>
              <span className="ml-2 tabular-nums text-muted-foreground">
                {i.issued_at.slice(0, 10).replace(/-/g, "/")}
              </span>
              {i.issued_by_email && (
                <span className="ml-2 truncate text-muted-foreground">{i.issued_by_email}</span>
              )}
              {i.note && <div className="mt-0.5 truncate text-muted-foreground">{i.note}</div>}
            </div>
            <a
              href={`/preview/project/${docId}/issue/${i.id}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-engenius-blue hover:underline"
            >
              開啟這一版
            </a>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        每一版存的是當下算好的完整內容，之後改規格也不會動到已存檔的版本。
        ⚠️ 直接用瀏覽器的列印（⌘P）不會留紀錄，要按預覽頁上的按鈕。
      </p>
    </div>
  );
}
