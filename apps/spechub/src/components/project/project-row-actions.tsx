"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Remove a project datasheet from the list.
 *
 * Two different actions behind one position, chosen by whether the document
 * has ever been issued:
 *
 *   never issued   delete — it is a row somebody created by accident, and
 *                  nothing outside this system knows it existed
 *   issued         archive — a PDF of it is in somebody's inbox, and the
 *                  snapshot of what they were shown is worth more than a
 *                  tidy list
 *
 * Offering both everywhere would put a destructive button next to the sheets
 * where it is most expensive, so the one that would lose evidence is simply
 * not shown. The API refuses it too — a UI that only hides a door is not a
 * lock.
 */
export function ProjectRowActions({
  id,
  name,
  archived,
  issued,
}: {
  id: string;
  name: string;
  archived: boolean;
  issued: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<Response>) {
    setBusy(true);
    try {
      const res = await fn();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `${label}失敗`);
      toast.success(`已${label}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label}失敗`);
    } finally {
      setBusy(false);
    }
  }

  const setStatus = (status: string, label: string) =>
    run(label, () =>
      fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    );

  if (archived) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void setStatus("draft", "取消封存")}
        className="text-muted-foreground hover:text-[#231f20]"
      >
        取消封存
      </button>
    );
  }

  if (issued) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void setStatus("archived", "封存")}
        className="text-muted-foreground hover:text-[#231f20]"
      >
        封存
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        // Types the name back, because the rows either side of it look the
        // same from a distance and this one does not come back.
        if (!window.confirm(`刪除「${name}」？這份文件從沒出過圖，刪掉不會留下任何紀錄。`)) return;
        void run("刪除", () => fetch(`/api/projects/${id}`, { method: "DELETE" }));
      }}
      className="text-muted-foreground hover:text-destructive"
    >
      刪除
    </button>
  );
}
