"use client";

/**
 * Print bar for project datasheets.
 *
 * Deliberately NOT `PrintToolbar`. That one drives /api/generate-pdf, which
 * writes a version row, files the PDF in the `datasheets` bucket and creates
 * a Drive folder for the product line — every one of which is a catalogue
 * side effect a tender draft must not have. Browser print keeps the output a
 * file on the user's machine and nothing else, which is the correct blast
 * radius for a document that may never be sent.
 */

import Link from "next/link";
import { useState } from "react";

export function ProjectPrintToolbar({ id, name }: { id: string; name: string }) {
  const [status, setStatus] = useState<string | null>(null);

  /**
   * Record the issue, THEN print.
   *
   * A failure here does not stop the print. Refusing to open the print dialog
   * because the audit row failed would trade a missing log line for a person
   * who cannot send their customer a datasheet — the wrong way round. The bar
   * says so instead, so nobody later believes the history is complete.
   */
  async function printAndRecord() {
    setStatus("記錄版本…");
    try {
      const res = await fetch(`/api/projects/${id}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "記錄失敗");
      setStatus(`已存為第 ${json.issue.issue_no} 版`);
    } catch (e) {
      setStatus(`未記錄版本：${e instanceof Error ? e.message : "unknown"}`);
    }
    window.print();
  }

  return (
    <div className="print-toolbar">
      <div className="pt-left">
        <Link href={`/projects/${id}`} className="pt-back">
          ← Edit
        </Link>
        <span className="pt-name">{name}</span>
        <span className="pt-badge">PRELIMINARY</span>
      </div>
      {status && <span className="pt-status">{status}</span>}
      <button type="button" onClick={() => void printAndRecord()} className="pt-print">
        Print / Save as PDF
      </button>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.print-toolbar {
  position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 50;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 0 20px; background: #231f20; color: #fff;
  font-family: system-ui, sans-serif; font-size: 13px;
}
.pt-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pt-back { color: #9aa3ab; text-decoration: none; white-space: nowrap; }
.pt-back:hover { color: #fff; }
.pt-name {
  font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pt-badge {
  background: #b45309; color: #fff; border-radius: 3px; padding: 2px 7px;
  font-size: 10px; font-weight: 700; letter-spacing: .06em; white-space: nowrap;
}
.pt-print {
  background: #03a9f4; color: #fff; border: 0; border-radius: 4px;
  padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
  white-space: nowrap;
}
.pt-print:hover { background: #0398db; }
.pt-status { color: #9aa3ab; white-space: nowrap; margin-left: auto; padding-right: 12px; }
@media print { .print-toolbar { display: none !important; } }
`,
        }}
      />
    </div>
  );
}
