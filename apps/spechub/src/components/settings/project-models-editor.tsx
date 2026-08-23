"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Model = { slug: string; label: string; tier: string | null; note: string | null };

type StepKey = "extract" | "intake" | "scenarios";
type Picks = Record<StepKey, string>;

type Loaded = Picks & {
  defaults: Picks;
  models: Model[];
};

const STEPS = [
  {
    key: "extract" as const,
    title: "讀取來源規格",
    where: "型號底下的「從 PDF / Excel 讀取規格」",
    what: "把原廠規格書逐條抄成規格列。長輸入、規則是「一個字都不准改」。",
  },
  {
    key: "intake" as const,
    title: "解析需求與答覆",
    where: "「貼上業務需求」和 gap review 裡回答問題",
    what: "把業務給的一段話拆成「哪些是規則、哪些是要問的問題」。短輸入、要判斷。",
  },
  {
    key: "scenarios" as const,
    title: "起草情境文案",
    where: "「應用情境圖」底下的「用 AI 起草情境文案」",
    what: "填一個產業，寫出情境圖旁邊的小標、引言和列點。輸出很短，但難的是拒絕——它拿到規格表，不准講表上沒有的東西。",
  },
];

/**
 * Which model each AI step uses.
 *
 * They were hard-coded constants, so changing one meant a code change and a
 * deploy. One setting per step and not one for all of them, because the jobs
 * are different — transcription, judgement, writing — and tuning one should
 * not silently move the others.
 */
export function ProjectModelsEditor() {
  const [data, setData] = useState<Loaded | null>(null);
  const [pick, setPick] = useState<Picks | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/project-models")
      .then((r) => r.json())
      .then((j: Loaded & { error?: string }) => {
        if (j.error) return toast.error(j.error);
        setData(j);
        setPick({ intake: j.intake, extract: j.extract, scenarios: j.scenarios });
      })
      .catch(() => toast.error("讀取失敗"));
  }, []);

  if (!data || !pick) return <p className="text-sm text-muted-foreground">讀取中…</p>;

  // Compared over the steps rather than field by field, so adding a fourth
  // step cannot leave Save greyed out on a change it does not know about.
  const dirty = STEPS.some((s) => pick![s.key] !== data![s.key]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/project-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pick),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "存檔失敗");
      setData((d) => (d && pick ? { ...d, ...pick } : d));
      toast.success("已儲存，下一次呼叫就會用新的模型");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "存檔失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {STEPS.map((step) => {
        const current = pick![step.key];
        const isDefault = current === data!.defaults[step.key];
        const known = data!.models.some((m) => m.slug === current);
        return (
          <div key={step.key} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="font-medium text-[#231f20]">{step.title}</h3>
              <span className="text-xs text-muted-foreground">{step.where}</span>
            </div>
            <p className="mt-1 max-w-[620px] text-xs text-muted-foreground">{step.what}</p>

            <select
              value={current}
              onChange={(e) => setPick((p) => (p ? { ...p, [step.key]: e.target.value } : p))}
              className="mt-3 h-9 w-full max-w-[460px] rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              {/* A slug saved before a model was removed from the catalog still
                  shows, rather than the select silently snapping to its first
                  option and hiding what is actually in use. */}
              {!known && <option value={current}>{current}（已不在目錄裡）</option>}
              {data!.models.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.label}
                  {m.tier ? ` · ${m.tier}` : ""} — {m.slug}
                </option>
              ))}
            </select>

            {isDefault && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">目前是程式碼裡的預設值。</p>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? "儲存中…" : dirty ? "儲存" : "已儲存"}
        </Button>
        <p className="text-xs text-muted-foreground">
          清單來自 EnGenie 的 Models 目錄（`llm_models`）。要新增或停用模型請去那裡改，這一頁只負責挑其中一個。
        </p>
      </div>
    </div>
  );
}
