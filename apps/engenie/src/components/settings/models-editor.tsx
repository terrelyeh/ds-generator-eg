"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SUPPORTED_SURFACES } from "@eg/llm/models";

interface ModelRow {
  slug: string;
  label: string;
  surfaces: string[];
  default_for: string[];
  reasoning_effort: string | null;
  enabled: boolean;
  sort_order: number;
  note: string | null;
}

const SURFACE_LABEL: Record<string, string> = {
  translate: "Datasheet 翻譯",
  ask: "EnGenie Ask",
};

export function ModelsEditor() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newSlug, setNewSlug] = useState("");

  useEffect(() => {
    fetch("/api/settings/models")
      .then((r) => r.json())
      .then((d) => d.ok && setRows(d.models ?? []))
      .catch(() => toast.error("讀取失敗"))
      .finally(() => setLoading(false));
  }, []);

  function patch(slug: string, next: Partial<ModelRow>) {
    setRows((prev) => prev.map((r) => (r.slug === slug ? { ...r, ...next } : r)));
    setDirty(true);
  }

  function toggleSurface(slug: string, surface: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.slug !== slug) return r;
        const on = r.surfaces.includes(surface);
        return {
          ...r,
          surfaces: on ? r.surfaces.filter((s) => s !== surface) : [...r.surfaces, surface],
          // Dropping the surface has to drop the default with it — a model
          // that defaults for somewhere it isn't offered leaves that
          // surface with a default it can never show.
          default_for: on ? r.default_for.filter((s) => s !== surface) : r.default_for,
        };
      }),
    );
    setDirty(true);
  }

  /** Default is single-select per surface: setting one clears the others. */
  function makeDefault(slug: string, surface: string) {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        default_for:
          r.slug === slug
            ? [...new Set([...r.default_for, surface])]
            : r.default_for.filter((s) => s !== surface),
      })),
    );
    setDirty(true);
  }

  function addRow() {
    const slug = newSlug.trim();
    if (!slug) return;
    if (!slug.includes("/")) {
      toast.error("要填 OpenRouter slug，格式是 vendor/model");
      return;
    }
    if (rows.some((r) => r.slug === slug)) {
      toast.error("這個 model 已經在清單裡");
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        slug,
        label: slug.split("/")[1] ?? slug,
        surfaces: [],
        default_for: [],
        reasoning_effort: null,
        enabled: true,
        sort_order: (prev.at(-1)?.sort_order ?? 0) + 10,
        note: null,
      },
    ]);
    setNewSlug("");
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models: rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "儲存失敗");
        return;
      }
      toast.success(`已儲存 ${data.count} 個模型`);
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-12 text-center text-sm text-slate-400">讀取中…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#231f20]">AI 模型</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            決定翻譯和 Ask 的下拉選單提供哪些模型、預設是哪一個。slug 就是 OpenRouter
            的 model id —— 換模型是改這裡的一行，不用改程式。
          </p>
        </div>
        <Button onClick={save} disabled={!dirty || saving} className="shrink-0">
          {saving ? "儲存中…" : dirty ? "儲存變更" : "已儲存"}
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
        新增前先確認 slug 存在，打錯字的 model 要到實際呼叫時才會失敗：
        <code className="ml-1 rounded bg-amber-100 px-1 py-0.5 font-mono">
          npx tsx scripts/list-openrouter-models.ts claude
        </code>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="px-3 py-2 text-left font-medium">顯示名稱 / slug</th>
              <th className="px-3 py-2 text-left font-medium">出現在</th>
              <th className="px-3 py-2 text-left font-medium">Reasoning</th>
              <th className="px-3 py-2 text-center font-medium">啟用</th>
              <th className="px-3 py-2 text-right font-medium">排序</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <input
                    value={r.label}
                    onChange={(e) => patch(r.slug, { label: e.target.value })}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  />
                  <code className="mt-0.5 block font-mono text-[11px] text-slate-400">{r.slug}</code>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {SUPPORTED_SURFACES.map((s) => {
                      const on = r.surfaces.includes(s);
                      const isDefault = r.default_for.includes(s);
                      return (
                        <div key={s} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSurface(r.slug, s)}
                            className={`rounded border px-1.5 py-0.5 text-[11px] transition ${
                              on
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 text-slate-400 hover:border-slate-300"
                            }`}
                          >
                            {SURFACE_LABEL[s] ?? s}
                          </button>
                          {on && (
                            <button
                              type="button"
                              onClick={() => makeDefault(r.slug, s)}
                              disabled={isDefault}
                              className={`text-[10px] ${
                                isDefault
                                  ? "font-medium text-engenius-blue"
                                  : "text-slate-400 underline hover:text-slate-600"
                              }`}
                            >
                              {isDefault ? "★ 預設" : "設為預設"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={r.reasoning_effort ?? ""}
                    onChange={(e) => patch(r.slug, { reasoning_effort: e.target.value || null })}
                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                  >
                    <option value="">模型預設</option>
                    <option value="none">none（關閉）</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => patch(r.slug, { enabled: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={r.sort_order}
                    onChange={(e) => patch(r.slug, { sort_order: Number(e.target.value) })}
                    className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <input
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRow()}
          placeholder="anthropic/claude-sonnet-5"
          className="flex-1 rounded border border-slate-200 px-3 py-2 font-mono text-sm"
        />
        <Button variant="outline" onClick={addRow}>
          新增模型
        </Button>
      </div>

      <p className="text-xs text-slate-400">
        關閉「啟用」會把模型從下拉選單移除，但已經記錄在帳本裡的花費不受影響。
        Reasoning 設 none 是給 flash 類模型用的 —— 它們的思考發生在第一個 token
        之前而且結果會被丟掉，開著等於白等 7–15 秒。
      </p>
    </div>
  );
}
