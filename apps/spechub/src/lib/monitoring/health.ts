/**
 * What counts as "the system is unwell", as a pure function.
 *
 * Two incidents in one week went unnoticed for a day or more, and neither
 * was subtle once you looked: the daily sync timed out repeatedly, and Ask's
 * vector search raised `operator does not exist` on every call. Nothing
 * watched either. This is what watches them.
 *
 * The rules below are shaped by what the signals can actually tell us:
 *
 *  - Usage is NOT health. Ask's last recorded call was 24 days before this
 *    was written, because few people use it — an alert on "no Ask calls"
 *    would fire every morning and be muted within a week.
 *  - Side effects are NOT "it ran". A skipped line does not stamp
 *    last_synced_at; an unchanged chunk is not rewritten. Hence heartbeats
 *    (migration 00054), which say the job reached its end whether or not it
 *    had work.
 *  - A path nobody exercised is a path nobody has checked. Retrieval is
 *    probed on purpose, rather than inferred from traffic.
 */

/** How stale each job's heartbeat may get before it is a problem. */
export const EXPECTED_JOBS: { job: string; label: string; maxAgeHours: number }[] = [
  // Daily 09:00 TW. A day plus two hours, so one late run is not an alert.
  { job: "sync", label: "SpecHub 每日同步", maxAgeHours: 26 },
  // Daily 09:30 TW.
  { job: "reindex-products", label: "EnGenie 產品重新索引", maxAgeHours: 26 },
  // Weekly, Sunday. Eight days.
  { job: "reindex-web", label: "EnGenie 網頁重新索引", maxAgeHours: 192 },
];

/** Fraction of the corpus that may disappear between runs before we shout. */
export const DOCUMENT_DROP_THRESHOLD = 0.2;

export interface Heartbeat {
  job: string;
  last_run_at: string;
  ok: boolean;
  detail: string | null;
}

export interface HealthInput {
  heartbeats: Heartbeat[];
  /** Did a synthetic call to the vector search succeed? */
  retrievalOk: boolean;
  retrievalError: string | null;
  documentCount: number;
  /** Document count at the previous health check, if there was one. */
  previousDocumentCount: number | null;
}

export interface Alert {
  severity: "critical" | "warning";
  title: string;
  detail: string;
}

export interface HealthReport {
  alerts: Alert[];
  /**
   * Send an "everything is fine" message even with no alerts.
   *
   * A monitor that only speaks when something is wrong is indistinguishable
   * from a monitor that has stopped running. Once a week it says so, and
   * silence for longer than that is itself the signal.
   */
  allClear: boolean;
}

function ageHours(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}

function formatAge(hours: number): string {
  if (hours < 48) return `${Math.floor(hours)} 小時`;
  return `${Math.floor(hours / 24)} 天`;
}

export function evaluateHealth(input: HealthInput, now: Date): HealthReport {
  const alerts: Alert[] = [];

  // Retrieval first: it is the one check that exercises a real code path,
  // and the outage it exists for produced no other symptom.
  if (!input.retrievalOk) {
    alerts.push({
      severity: "critical",
      title: "Ask 的向量檢索無法執行",
      detail:
        `${input.retrievalError ?? "unknown error"}\n` +
        "每一次 Ask 提問都會失敗。先看 match_documents_scoped 的 search_path 是否包含 extensions。",
    });
  }

  const byJob = new Map(input.heartbeats.map((h) => [h.job, h]));
  for (const { job, label, maxAgeHours } of EXPECTED_JOBS) {
    const hb = byJob.get(job);
    if (!hb) {
      alerts.push({
        severity: "warning",
        title: `${label} 從來沒有回報過`,
        detail: `job_heartbeats 裡沒有 "${job}" 這一列。可能是還沒部署，也可能是它從未跑完。`,
      });
      continue;
    }
    const age = ageHours(hb.last_run_at, now);
    if (age > maxAgeHours) {
      alerts.push({
        severity: "critical",
        title: `${label} 已經 ${formatAge(age)} 沒有跑完`,
        detail: `上一次完成是 ${hb.last_run_at}，預期至少每 ${maxAgeHours} 小時一次。`,
      });
    } else if (!hb.ok) {
      // Ran, and said so, but reported failure. Distinct from not running.
      alerts.push({
        severity: "warning",
        title: `${label} 上一次跑完但回報失敗`,
        detail: hb.detail ?? "(沒有細節)",
      });
    }
  }

  // Guards the cleanup that deletes chunks for sources that vanished: a bug
  // there takes the knowledge base with it, and retrieval keeps answering —
  // worse, more confidently — from whatever is left.
  if (
    input.previousDocumentCount !== null &&
    input.previousDocumentCount > 0 &&
    input.documentCount < input.previousDocumentCount * (1 - DOCUMENT_DROP_THRESHOLD)
  ) {
    const lost = input.previousDocumentCount - input.documentCount;
    alerts.push({
      severity: "critical",
      title: "知識庫的 chunk 數量大幅下降",
      detail:
        `${input.previousDocumentCount} → ${input.documentCount}（少了 ${lost}，` +
        `超過 ${DOCUMENT_DROP_THRESHOLD * 100}%）。` +
        "如果沒有人刻意刪來源，先查 deleteVanishedSources 的宇宙判斷。",
    });
  }

  return { alerts, allClear: alerts.length === 0 && now.getUTCDay() === 1 };
}

/** The Telegram message, or null when there is nothing worth sending. */
export function formatHealthMessage(report: HealthReport, now: Date): string | null {
  const stamp = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  if (report.alerts.length === 0) {
    return report.allClear
      ? `✅ SpecHub / EnGenie 每週健康檢查：一切正常\n${stamp}\n\n` +
          `（這則每週一送一次。如果超過一週沒收到，是健康檢查本身停了。）`
      : null;
  }
  const lines = report.alerts.map(
    (a) => `${a.severity === "critical" ? "🔴" : "🟠"} ${a.title}\n   ${a.detail.replace(/\n/g, "\n   ")}`,
  );
  return `SpecHub / EnGenie 健康檢查\n${stamp}\n\n${lines.join("\n\n")}`;
}
