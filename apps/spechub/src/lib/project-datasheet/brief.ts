/**
 * The clarification brief — the gap review as something you can send.
 *
 * This is the actual output of the review, not the on-screen list. The people
 * who can answer these questions are not in SpecHub: sales is in a chat app,
 * RD is in a meeting, the ODM is on email in another timezone. A beautifully
 * grouped panel that only the author can see closes no gaps at all.
 *
 * Written in zh-TW because that is the language the questions get asked in.
 * The text is a starting point — it goes into a message box and gets edited,
 * which is why it is templated rather than generated: a question put to a
 * supplier should read the same way every time, and nobody wants to diff two
 * LLM phrasings of "how many antennas".
 *
 * Grouped by WHO can answer rather than by severity. Severity orders the list
 * within a group; it does not decide who gets the email.
 */

import type { AskedOf, Finding, Severity } from "./gap-scan";

export interface BriefFinding extends Finding {
  /** answered/dismissed questions drop out of the brief */
  state: "open" | "answered" | "dismissed" | "resolved";
  answer?: string | null;
}

const GROUP_ORDER: AskedOf[] = ["rd", "odm", "sales", "internal"];

const GROUP_TITLE: Record<AskedOf, string> = {
  rd: "給 RD／工程",
  odm: "給 ODM",
  sales: "給業務／客戶端",
  internal: "我方待辦（不用問人）",
};

const GROUP_LEAD: Record<AskedOf, string> = {
  rd: "這幾項是我們對來源做過的改動，想跟你確認：",
  odm: "這幾項來源沒給，想跟你們確認：",
  sales: "這幾項需要你或客戶那邊給個方向：",
  internal: "這幾項不用問人，我們自己處理：",
};

const SEVERITY_RANK: Record<Severity, number> = { blocking: 0, advisory: 1 };

export interface BriefInput {
  docName: string;
  customer: string | null;
  findings: BriefFinding[];
  /** yyyy-mm-dd; passed in so the brief is reproducible */
  date: string;
}

/**
 * Fold repeats of the same check into one numbered item.
 *
 * Seven consecutive bullets that differ only in a spec name, each carrying an
 * identical paragraph of explanation, is a list nobody reads to the end of —
 * and the ODM group is exactly that shape whenever one model is less
 * documented than the other. One item with seven names asks the same question
 * and can actually be answered in one reply.
 */
function collapse(items: BriefFinding[]): {
  severity: Severity;
  detail: string;
  titles: string[];
}[] {
  const out: { severity: Severity; detail: string; titles: string[] }[] = [];
  const index = new Map<string, number>();
  for (const f of items) {
    const key = `${f.code}|${f.detail}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ severity: f.severity, detail: f.detail, titles: [f.title] });
    } else {
      out[at].titles.push(f.title);
    }
  }
  return out;
}

export function buildBrief({ docName, customer, findings, date }: BriefInput): string {
  const open = findings.filter((f) => f.state === "open");
  const lines: string[] = [];

  lines.push(docName);
  if (customer) lines.push(`客戶：${customer}`);
  lines.push(`日期：${date}`);
  lines.push("");

  if (open.length === 0) {
    lines.push("目前沒有待釐清的項目 — 規格內容都有來源或已經確認過。");
    return lines.join("\n");
  }

  const blocking = open.filter((f) => f.severity === "blocking").length;
  lines.push(
    blocking > 0
      ? `還有 ${open.length} 項待確認，其中 ${blocking} 項在確認前不建議送出。`
      : `還有 ${open.length} 項待補，都不影響先送一版出去。`,
  );
  lines.push("");

  let n = 0;
  for (const group of GROUP_ORDER) {
    const items = open
      .filter((f) => f.askedOf === group)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    if (items.length === 0) continue;

    lines.push(`▍${GROUP_TITLE[group]}`);
    lines.push(GROUP_LEAD[group]);
    lines.push("");
    for (const entry of collapse(items)) {
      n += 1;
      // The marker earns its place: it tells the reader which answers hold up
      // the document and which are tidying, without them having to ask.
      const mark = entry.severity === "blocking" ? "◆" : "·";
      if (entry.titles.length === 1) {
        lines.push(`${n}. ${mark} ${entry.titles[0]}`);
      } else {
        lines.push(`${n}. ${mark} 以下 ${entry.titles.length} 項：`);
        for (const t of entry.titles) lines.push(`   · ${t}`);
      }
      lines.push(`   ${entry.detail}`);
      lines.push("");
    }
  }

  lines.push("—");
  lines.push("◆ = 確認前不建議送出　· = 可以之後補");
  lines.push(
    "這份是 preliminary datasheet，未確認的規格會印成 TBD，不會憑空填一個數字進去。",
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
