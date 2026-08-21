"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GapReview, type ReviewCounts } from "@/components/project/gap-review";
import { RequirementsIntake } from "@/components/project/requirements-intake";
import { SourceExtract } from "@/components/project/source-extract";
import { AddModelMenu } from "@/components/project/add-model-menu";
import { ImageManager, MODEL_SLOTS, DOC_SLOTS } from "@/components/project/image-manager";
import { IssueHistory } from "@/components/project/issue-history";
import type { ModelImage } from "@/lib/project-datasheet/types";
import { SpecFormatHelp } from "@/components/project/spec-format-help";
import { LayoutPicker } from "@/components/project/layout-picker";
import { SpecPreview, toggleHideLine } from "@/components/project/spec-preview";
import { asRawDoc, asRules, findOrphanedRules } from "@/lib/project-datasheet/resolve";
import {
  parseFeatureBlocks,
  parseRules,
  parseSpecRows,
  serializeFeatureBlocks,
  serializeRules,
  serializeSpecRows,
} from "@/lib/project-datasheet/text-format";
import { DEFAULT_SECTIONS } from "@/lib/project-datasheet/types";
import type { SectionToggles } from "@/lib/project-datasheet/types";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

const SECTION_LABELS: { key: keyof SectionToggles; label: string; hint: string }[] = [
  { key: "features", label: "Features & Benefits", hint: "賣點頁" },
  { key: "specs", label: "Technical Specifications", hint: "規格對照表" },
  { key: "software", label: "Software Features", hint: "標了 ## software 的規格列" },
  { key: "hardware", label: "Hardware Overview", hint: "封面以外的產品圖" },
  { key: "package", label: "Package Contents", hint: "標了 ## package 的規格列" },
  { key: "diagram", label: "應用情境圖", hint: "文件層圖片裡的 diagram" },
];

/**
 * Past this many columns the spec table's value columns hit their 70pt floor
 * and the matrix stops being readable side by side. Not enforced — a wide
 * tender sheet is still better than no tender sheet — but said out loud,
 * because the person adding the fifth model cannot see the PDF from here.
 */
const COMFORTABLE_MODELS = 4;

interface ModelDraft {
  id: string;
  model_name: string;
  display_name: string;
  raw: string;
  rules: string;
}

export function ProjectEditor({
  doc,
  models,
}: {
  doc: ProjectDatasheet;
  models: ProjectDatasheetModel[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [reviewKey, setReviewKey] = useState(0);
  const [counts, setCounts] = useState<ReviewCounts | null>(null);
  const [tab, setTab] = useState("status");
  const [modelTab, setModelTab] = useState<string | null>(null);

  // ── printed content ──────────────────────────────────────────────────
  const [name, setName] = useState(doc.name);
  const [customer, setCustomer] = useState(doc.customer ?? "");
  const [status, setStatus] = useState(doc.status);
  const [layout, setLayout] = useState(doc.layout);
  const [headline, setHeadline] = useState(doc.headline ?? "");
  const [seriesName, setSeriesName] = useState(doc.series_name ?? "");
  const [categoryLabel, setCategoryLabel] = useState(doc.category_label ?? "");
  const [overview, setOverview] = useState(doc.overview ?? "");
  const [footnote, setFootnote] = useState(doc.footnote ?? "");
  const [features, setFeatures] = useState(() =>
    serializeFeatureBlocks(
      Array.isArray(doc.features) ? (doc.features as { title: string; bullets: string[] }[]) : [],
    ),
  );
  const [disclaimer, setDisclaimer] = useState(doc.disclaimer);
  const [imageNote, setImageNote] = useState(doc.image_note ?? "");
  const [confidentiality, setConfidentiality] = useState(doc.confidentiality ?? "");
  const [blankPolicy, setBlankPolicy] = useState(doc.blank_policy);
  const [diagramTitle, setDiagramTitle] = useState(doc.diagram_title ?? "");
  const [diagramNote, setDiagramNote] = useState(doc.diagram_note ?? "");
  const [docRules, setDocRules] = useState(() => serializeRules(asRules(doc.doc_rules)));
  const [sections, setSections] = useState<SectionToggles>({
    ...DEFAULT_SECTIONS,
    ...((doc.sections as Partial<SectionToggles>) ?? {}),
  });

  // ── internal only, never printed ─────────────────────────────────────
  const [notes, setNotes] = useState(doc.notes ?? "");
  const [branch, setBranch] = useState(doc.branch ?? "");
  const [salesOwner, setSalesOwner] = useState(doc.sales_owner ?? "");
  const [opportunity, setOpportunity] = useState(doc.opportunity ?? "");
  const [tenderDate, setTenderDate] = useState(doc.tender_date ?? "");

  const [drafts, setDrafts] = useState<ModelDraft[]>(() =>
    models.map((m) => ({
      id: m.id,
      model_name: m.model_name,
      display_name: m.display_name ?? "",
      raw: serializeSpecRows(asRawDoc(m.raw_doc)),
      rules: serializeRules(asRules(m.rules)),
    })),
  );

  /**
   * Unsaved-changes flag. Fields now live on four tabs, so "I edited
   * something and navigated away" stopped being visible — the whole form used
   * to be on screen at once.
   */
  const initial = useMemo(
    () =>
      JSON.stringify([
        doc.name, doc.customer ?? "", doc.status, doc.layout, doc.headline ?? "",
        doc.series_name ?? "", doc.category_label ?? "", doc.overview ?? "",
        doc.footnote ?? "", doc.disclaimer, doc.confidentiality ?? "", doc.image_note ?? "", doc.blank_policy,
        doc.notes ?? "", doc.branch ?? "", doc.sales_owner ?? "", doc.opportunity ?? "",
        doc.tender_date ?? "", doc.diagram_title ?? "", doc.diagram_note ?? "",
        serializeFeatureBlocks(
          Array.isArray(doc.features) ? (doc.features as { title: string; bullets: string[] }[]) : [],
        ),
        serializeRules(asRules(doc.doc_rules)),
        { ...DEFAULT_SECTIONS, ...((doc.sections as Partial<SectionToggles>) ?? {}) },
        models.map((m) => [
          m.model_name, m.display_name ?? "",
          serializeSpecRows(asRawDoc(m.raw_doc)), serializeRules(asRules(m.rules)),
        ]),
      ]),
    [doc, models],
  );
  const current = JSON.stringify([
    name, customer, status, layout, headline, seriesName, categoryLabel, overview,
    footnote, disclaimer, confidentiality, imageNote, blankPolicy, notes, branch, salesOwner,
    opportunity, tenderDate, diagramTitle, diagramNote, features, docRules, sections,
    drafts.map((d) => [d.model_name, d.display_name, d.raw, d.rules]),
  ]);
  const dirty = current !== initial;

  /**
   * Rules that match nothing at all.
   *
   * A model's OWN rules are checked against its own rows — that's the case
   * that matters, and the reason the check exists: a rule that silently stops
   * applying is how a hidden chipset reappears.
   *
   * Document-level rules are checked against EVERY model's rows combined. A
   * doc-level `- flash` is doing its job even though only the 5G unit has a
   * flash row, and flagging it on the 4G column was reporting correct
   * behaviour as a mistake — which is the fastest way to teach someone that
   * this warning is noise.
   */
  const orphans = useMemo(() => {
    const allRows = drafts.flatMap((d) => parseSpecRows(d.raw));
    const docOrphans = findOrphanedRules(allRows, parseRules(docRules));
    return drafts.map((d) => ({
      model: d.model_name,
      keys: [
        ...new Set([...docOrphans, ...findOrphanedRules(parseSpecRows(d.raw), parseRules(d.rules))]),
      ],
    }));
  }, [drafts, docRules]);

  // Falls back to the first column rather than storing an id that a delete
  // or a refresh can invalidate.
  const activeModel =
    modelTab && drafts.some((d) => d.id === modelTab) ? modelTab : (drafts[0]?.id ?? "");

  /**
   * `+` lines written in the DOCUMENT-level box.
   *
   * `mergeRules` takes `add` from the model only, so a doc-level addition is
   * parsed, stored, and then silently dropped — the row never appears and
   * nothing says why. Adding a row for every model already has a spelling
   * (`key = value`, which invents the row wherever it's missing), so the fix
   * is to point at it rather than to accept two syntaxes for one act.
   */
  const docAddLines = (parseRules(docRules).add ?? []).map((a) => a.label);

  const docImageCount = parseImagesJson(doc.images).length;
  const withSpecs = drafts.filter((d) => d.raw.trim().length > 0).length;
  const withImages = models.filter(
    (m) => Array.isArray(m.images) && (m.images as unknown[]).length > 0,
  ).length;

  /**
   * What to do now.
   *
   * The single most important thing on the page. Before this, everything the
   * document knew about itself was spread over a dozen panels of equal
   * weight, and the answer to "what am I supposed to be doing" was to read
   * all of them.
   */
  const nextStep = useMemo((): { text: string; action?: string; tab?: string } => {
    if (drafts.length === 0)
      return { text: "先加一個型號。每個型號會變成規格表上的一欄。", action: "去加型號", tab: "specs" };
    if (withSpecs === 0)
      return {
        text: "型號還沒有規格。上傳原廠的 PDF／Excel，或從我們已經在賣的型號帶入。",
        action: "去讀規格",
        tab: "specs",
      };
    // Until the scan lands we know nothing, and the branches below would
    // otherwise fall through to "nothing is wrong" — the most reassuring
    // possible thing to say while still counting the problems.
    if (!counts) return { text: "正在檢查還缺什麼…" };
    if (counts.blocking > 0)
      return {
        text: `有 ${counts.blocking} 項在確認前不建議送出——多半要問 RD 或 ODM。產生澄清訊息貼給他們。`,
        action: "去看待確認的",
        tab: "status",
      };
    if (withImages === 0)
      return { text: "沒有產品圖，封面會印佔位框。", action: "去上傳", tab: "specs" };
    if (status !== "ready")
      return { text: "沒有會出錯的項目了，可以把狀態改成「可以送出」。", action: "去改狀態", tab: "internal" };
    return { text: "這份可以送出了。用右上角「預覽」列印或存成 PDF。" };
  }, [drafts.length, withSpecs, withImages, counts, status]);

  function setDraft(id: string, patch: Partial<ModelDraft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  async function save() {
    if (!disclaimer.trim()) {
      toast.error("對外聲明不能空白 —— 可以改寫法，但不能拿掉。");
      setTab("content");
      return;
    }
    setSaving(true);
    try {
      const docRes = await fetch(`/api/projects/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          customer: customer || null,
          status,
          layout,
          headline: headline || null,
          series_name: seriesName || null,
          category_label: categoryLabel || null,
          overview: overview || null,
          footnote: footnote || null,
          features: parseFeatureBlocks(features),
          disclaimer,
          confidentiality: confidentiality || null,
          image_note: imageNote || null,
          blank_policy: blankPolicy,
          diagram_title: diagramTitle || null,
          diagram_note: diagramNote || null,
          doc_rules: parseRules(docRules),
          sections,
          // `images` is deliberately absent from both payloads: the uploader
          // writes them the moment a file lands, so including a copy captured
          // when the form mounted would wipe every upload made since.
          notes: notes || null,
          branch: branch || null,
          sales_owner: salesOwner || null,
          opportunity: opportunity || null,
          tender_date: tenderDate || null,
        }),
      });
      const docJson = await docRes.json();
      if (!docRes.ok) throw new Error(docJson.error ?? "存檔失敗");

      for (const d of drafts) {
        const res = await fetch(`/api/projects/${doc.id}/models`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: d.id,
            model_name: d.model_name,
            display_name: d.display_name || null,
            raw_doc: parseSpecRows(d.raw),
            rules: parseRules(d.rules),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `${d.model_name} 存檔失敗`);
      }

      toast.success("已儲存");
      setReviewKey((k) => k + 1);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "存檔失敗");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    const nextName = window.prompt("新的名稱", `${doc.name}（複製）`)?.trim();
    if (!nextName) return;
    const nextCustomer = window.prompt("新的客戶（可留空，之後再填）")?.trim() ?? "";
    try {
      const res = await fetch(`/api/projects/${doc.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName, customer: nextCustomer }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "複製失敗");
      toast.success(
        `已複製 ${json.models} 個型號` +
          (json.carriedAnswers ? `，帶過 ${json.carriedAnswers} 筆已確認的答覆` : ""),
      );
      router.push(`/projects/${json.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "複製失敗");
    }
  }

  async function removeModel(id: string, modelName: string) {
    if (!window.confirm(`把 ${modelName} 從這份 datasheet 移除？`)) return;
    const res = await fetch(`/api/projects/${doc.id}/models`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok) return toast.error(json.error ?? "移除失敗");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* ── header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
            ← Project Datasheets
          </Link>
          <h1 className="mt-1 truncate font-heading text-2xl font-semibold text-[#231f20]">
            {doc.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {customer && <span>{customer}</span>}
            <span className="rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide">
              {status === "draft" ? "草稿" : status === "ready" ? "可以送出" : "已封存"}
            </span>
            {dirty && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
                有未儲存的變更
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/preview/project/${doc.id}`}
            target="_blank"
            className={buttonVariants({ variant: "outline" })}
          >
            預覽 / 列印
          </Link>
          <Button variant="outline" onClick={() => void duplicate()} disabled={saving}>
            複製給別的客戶
          </Button>
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? "儲存中…" : dirty ? "儲存" : "已儲存"}
          </Button>
        </div>
      </div>

      {/* ── what to do now ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-[3px] border-l-engenius-blue bg-sky-50/60 px-4 py-3">
        <p className="text-sm text-[#231f20]">
          <span className="font-semibold">下一步：</span> {nextStep.text}
        </p>
        {nextStep.action && nextStep.tab && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // Already on that tab, so switching would do nothing visible —
              // a button that appears to be broken. Scroll to the section
              // instead, which is what "去看" meant either way.
              if (tab === nextStep.tab) {
                document
                  .getElementById(`section-${nextStep.tab}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              } else {
                setTab(nextStep.tab!);
              }
            }}
          >
            {nextStep.action}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList variant="line" className="w-full justify-start gap-4 border-b">
          <TabsTrigger value="status">
            狀態與待辦
            {counts && counts.open > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  counts.blocking > 0
                    ? "bg-amber-100 text-amber-900"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {counts.blocking > 0 ? counts.blocking : counts.open}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="internal">內部資訊</TabsTrigger>
          <TabsTrigger value="content">封面與文案</TabsTrigger>
          <TabsTrigger value="specs">
            規格與型號
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {drafts.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ══ 狀態與待辦 ══════════════════════════════════════════ */}
        <TabsContent value="status" className="space-y-5 pt-5">
          <RequirementsIntake
            docId={doc.id}
            modelCount={drafts.length}
            onGoToModels={() => setTab("specs")}
            onApplied={() => {
              setReviewKey((k) => k + 1);
              router.refresh();
            }}
          />
          <div id="section-status">
            <GapReview docId={doc.id} key={reviewKey} onCounts={setCounts} />
          </div>
        </TabsContent>

        <TabsContent value="internal" className="space-y-5 pt-5">
          <Panel
            title="出圖紀錄"
            note="這份文件每一次產生 PDF 都會存一版，可以回頭查客戶手上那份寫了什麼。"
          >
            <IssueHistory docId={doc.id} updatedAt={doc.updated_at} />
          </Panel>

          {/* Tinted and labelled, because the complaint that started this
              redesign was that internal and printed content sat side by side
              looking identical. */}
          <section className="space-y-4 rounded-lg border-2 border-dashed border-slate-400 bg-slate-100 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-slate-700">
                  內部資訊
                </h2>
                <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  不會印出來
                </span>
              </div>
              <p className="mt-1 max-w-[640px] text-xs text-slate-600">
                這一頁的每一個欄位都只給我們自己看，PDF 上完全不會出現。
                一份指名我方業務、內部案子階段、我們猜客戶會買多少的報價文件，
                是根本不該離開公司的東西。
              </p>
            </div>

            <Grid>
              <Field label="文件狀態" hint="「可以送出」要等沒有會出錯的項目才切得過去">
                <Select
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "draft", label: "草稿" },
                    { value: "ready", label: "可以送出" },
                    { value: "archived", label: "已封存" },
                  ]}
                />
              </Field>
              <Field label="分公司／區域" hint="需求從哪裡來的">
                <Input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="EnGenius Malaysia"
                />
              </Field>
              <Field label="業務負責人" hint="澄清訊息要寄給誰">
                <Input value={salesOwner} onChange={(e) => setSalesOwner(e.target.value)} />
              </Field>
              <Field label="專案／案號" hint="對得上報價單或 CRM 的編號">
                <Input value={opportunity} onChange={(e) => setOpportunity(e.target.value)} />
              </Field>
              <Field label="標案時間" hint="怎麼寫都行 ——「2026 Q3」「三月底前」「RFQ 截止 3/14」">
                <Input
                  value={tenderDate}
                  onChange={(e) => setTenderDate(e.target.value)}
                  placeholder="2026 Q3"
                />
              </Field>
            </Grid>
            <Field label="備註" hint="任何之後的自己會想知道的事">
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <p className="text-xs text-slate-500">
              最後更新：
              <span className="tabular-nums">
                {" "}
                {new Date(doc.updated_at).toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </p>
          </section>
        </TabsContent>

        <TabsContent value="content" className="space-y-5 pt-5">
          <Panel title="基本設定">
            <Grid>
              <Field label="文件名稱" hint="只在列表上顯示，不會印出來">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="客戶" hint="會出現在對外聲明裡（「Prepared for …」）">
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
              </Field>
            </Grid>
            <Field label="版型">
              <LayoutPicker value={layout} onChange={setLayout} />
            </Field>
          </Panel>

          <Panel title="封面" note="這一區的內容全部會印在 PDF 第一頁。">
            <Grid>
              <Field label="主標" hint="封面最大的那行字">
                <Input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Outdoor 4G / 5G Cellular Routers"
                />
              </Field>
              <Field label="副標" hint="主標下面的藍字">
                <Input
                  value={seriesName}
                  onChange={(e) => setSeriesName(e.target.value)}
                  placeholder="EOR100 / EOR200"
                />
              </Field>
              <Field label="分類標籤" hint="藍色橫幅右上角的小型大寫字">
                <Input
                  value={categoryLabel}
                  onChange={(e) => setCategoryLabel(e.target.value)}
                  placeholder="CELLULAR ROUTER"
                />
              </Field>
            </Grid>
            <Field label="Overview" hint="封面的說明文字，兩段左右">
              <Textarea rows={6} value={overview} onChange={(e) => setOverview(e.target.value)} />
            </Field>
            <Field
              label="Features & Benefits"
              hint="賣點頁。空一行分隔一個區塊；每個區塊第一行是標題，其餘每行是一個條列。"
            >
              <Textarea rows={9} value={features} onChange={(e) => setFeatures(e.target.value)} />
            </Field>
            <Field
              label="註腳"
              hint="封面底部的小字。放規格的但書——原廠 datasheet 常見的那種：「① B29/B32 僅支援 Rx」「實際速率視電信商而定」。沒有就留空，留空不會印。"
            >
              <Input
                value={footnote}
                onChange={(e) => setFootnote(e.target.value)}
                placeholder="Actual throughput varies by carrier and network conditions."
              />
            </Field>
            <div className="space-y-2">
              <Field
                label="應用情境圖的標題"
                hint="印在圖上方。留空就用預設的「Application Diagram」。"
              >
                <Input
                  value={diagramTitle}
                  onChange={(e) => setDiagramTitle(e.target.value)}
                  placeholder="Application scenarios"
                />
              </Field>
              <Field
                label="應用情境圖的說明"
                hint="圖上刻意沒有文字（圖像模型會把 802.3af/at 這種標籤畫成錯字），所以說明由版面用真字型排。"
              >
                <Textarea
                  rows={3}
                  value={diagramNote}
                  onChange={(e) => setDiagramNote(e.target.value)}
                />
              </Field>
              <ImageManager
                docId={doc.id}
                modelId={null}
                initial={parseImagesJson(doc.images)}
                slots={DOC_SLOTS}
                label="應用情境圖"
                hint="第一張是主圖（畫得比較細、有接線的那種），之後每一張會排成下方一列情境小圖。產品照請到「規格與型號」裡各台底下傳。"
              />
              {/* Two steps for one outcome is a trap, so the dependency says
                  so out loud in whichever direction it is currently broken. */}
              {docImageCount > 0 && !sections.diagram && (
                <p className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span>
                    有圖，但「要印哪些頁」的<strong>應用情境圖沒有勾選</strong>，所以不會印出來。
                  </span>
                  <button
                    type="button"
                    className="rounded border border-amber-500 bg-white px-2 py-0.5 font-medium"
                    onClick={() => setSections((x) => ({ ...x, diagram: true }))}
                  >
                    幫我勾起來
                  </button>
                </p>
              )}
              {docImageCount === 0 && sections.diagram && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  「應用情境圖」勾了但還沒有圖，那一頁不會印。傳一張上來就會出現。
                </p>
              )}
            </div>
          </Panel>

          <Panel
            title="要印哪些頁"
            note="還不存在的東西就關掉，不要印一頁空的。報價階段通常還沒有包裝，所以 Package Contents 預設是關的。"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SECTION_LABELS.map(({ key, label, hint }) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sections[key]}
                    onChange={(e) => setSections((s) => ({ ...s, [key]: e.target.checked }))}
                    className="mt-1"
                  />
                  <span>
                    {label}
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <Field label="沒有值的格子印什麼" hint="某一台缺這項規格時，那一格要顯示什麼">
              <Select
                value={blankPolicy}
                onChange={setBlankPolicy}
                options={[
                  { value: "tbd", label: "TBD —— 之後會補（預設）" },
                  { value: "na", label: "— —— 本來就沒有這項" },
                  { value: "blank", label: "留白" },
                ]}
              />
            </Field>
          </Panel>

          <Panel
            title="對外聲明"
            note="兩則都會印在文件上。措辭是你的，但「有沒有」不是——這份文件最大的風險就是它看起來跟正式 datasheet 一模一樣。"
          >
            <Field label="PRELIMINARY 聲明" hint="印在封面和頁尾。不能空白。">
              <Textarea
                rows={3}
                value={disclaimer}
                onChange={(e) => setDisclaimer(e.target.value)}
                aria-invalid={!disclaimer.trim()}
              />
            </Field>
            <Field
              label="機密標示"
              hint="印在封面和頁尾。跟 PRELIMINARY 是兩件事——那個講「數字可能還會變」，這個講「誰可以看」。留空就不印。"
            >
              <Input
                value={confidentiality}
                onChange={(e) => setConfidentiality(e.target.value)}
                placeholder="CONFIDENTIAL — Provided for tender evaluation. Not for public distribution."
              />
            </Field>
            <Field label="圖片註記" hint="只要文件有圖，就會印在硬體圖下方">
              <Input value={imageNote} onChange={(e) => setImageNote(e.target.value)} />
            </Field>
          </Panel>
        </TabsContent>

        <TabsContent value="specs" className="space-y-5 pt-5" id="section-specs">
          <Panel
            title="最終規格表（會印出來的）"
            note="來源規格套上規則之後的樣子，你一邊改一邊變。有標記的格子就是被規則動過的——這是看「規則到底做了什麼」最快的地方。"
          >
            <SpecPreview
              models={drafts}
              docRulesText={docRules}
              blankPolicy={blankPolicy}
              onToggleHide={(key, hide) => setDocRules((r) => toggleHideLine(r, key, hide))}
            />
          </Panel>

          <Panel
            title={`全部型號都套用的調整（${drafts.length} 台都會生效）`}
            note="業務的要求通常就是這種——「不要放 chipset」「都是 IP67」，講的是整份文件。每一台底下還有自己的調整區，會疊在這上面；但這裡藏掉的規格列，個別型號放不回來。"
          >
            <SpecFormatHelp kind="rules" />
            <Textarea
              rows={6}
              value={docRules}
              onChange={(e) => setDocRules(e.target.value)}
              className="font-mono text-xs"
              placeholder={"- cpu\ningress_protection = IP67"}
            />
            {docAddLines.length > 0 && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <strong>這裡的 + 不會生效：</strong>
                {docAddLines.join("、")}。
                <code className="mx-1 rounded bg-white px-1">+</code>
                只在個別型號的調整區有用（新增一列要有那一台自己的值）。
                <br />
                如果每一台的值都一樣，直接寫{" "}
                <code className="rounded bg-white px-1">
                  {docAddLines[0]
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "_")
                    .replace(/^_+|_+$/g, "")}{" "}
                  = 值
                </code>{" "}
                就好——來源沒有這一列的話會自己長出來，效果一樣。
              </p>
            )}
          </Panel>

          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold text-[#231f20]">
                  型號 — 這份文件有 {drafts.length} 台
                </h2>
                <p className="mt-0.5 max-w-[620px] text-xs text-muted-foreground">
                  <strong>一台型號 = 規格表上的一欄</strong>，所以規格表會有 {drafts.length} 欄，
                  由左至右照下面分頁的順序排。規格列會自動對齊：某一台有、另一台沒有的列，
                  缺的那格會印 TBD 或 —。
                </p>
              </div>
              <AddModelMenu docId={doc.id} onAdded={() => router.refresh()} />
            </div>

            {drafts.length >= COMFORTABLE_MODELS && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                已經有 {drafts.length} 欄。再多下去規格表每一欄會窄到很難讀，
                長的頻段字串會擠成一直條。超過 {COMFORTABLE_MODELS} 台建議拆成兩份文件。
              </p>
            )}

            {drafts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                還沒有型號。用右上角加一台——
                <strong>「從既有型號帶入」</strong>是拿我們已經在賣的機種（規格、文案、產品圖一起帶），
                <strong>「加空白型號」</strong>是開一欄全空的自己填。
              </div>
            ) : (
              /* One model per tab. Stacked, two models ran to several screens
                 of near-identical fields and it stopped being obvious which
                 one you were editing. */
              <Tabs value={activeModel} onValueChange={(v) => setModelTab(v as string)}>
                <TabsList className="w-full justify-start">
                  {drafts.map((d, i) => (
                    <TabsTrigger key={d.id} value={d.id}>
                      第 {i + 1} 欄 · {d.model_name || "（未命名）"}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {drafts.map((d, i) => {
                  const orphan = orphans.find((o) => o.model === d.model_name);
                  const model = models.find((m) => m.id === d.id);
                  const rowCount = parseSpecRows(d.raw).length;
                  const shortName = d.model_name || `第 ${i + 1} 欄`;
                  return (
                    <TabsContent key={d.id} value={d.id} className="space-y-4 pt-4">
                      <section className="space-y-4 rounded-lg border p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                          <div>
                            {/* Big, because the previous small-caps panel
                                title left people unsure which unit they were
                                looking at. */}
                            <div className="flex items-baseline gap-2">
                              <span className="rounded bg-[#231f20] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                第 {i + 1} 欄
                              </span>
                              <h3 className="font-heading text-xl font-semibold text-[#231f20]">
                                {shortName}
                              </h3>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {rowCount > 0
                                ? `目前 ${rowCount} 列規格`
                                : "還沒有規格——用下面的「上傳原廠 PDF / Excel」或直接手打"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeModel(d.id, d.model_name)}
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            移除這一欄
                          </button>
                        </div>

                        <Grid>
                          <Field label="型號" hint="印在封面圖下方與規格表的表頭">
                            <Input
                              value={d.model_name}
                              onChange={(e) => setDraft(d.id, { model_name: e.target.value })}
                            />
                          </Field>
                          <Field label="品名／說明" hint="印在型號下面那一行小字">
                            <Input
                              value={d.display_name}
                              onChange={(e) => setDraft(d.id, { display_name: e.target.value })}
                              placeholder="4G Indoor / Outdoor Router"
                            />
                          </Field>
                        </Grid>

                        <ImageManager
                          docId={doc.id}
                          modelId={d.id}
                          initial={parseImagesJson(model?.images)}
                          slots={MODEL_SLOTS}
                          label="產品圖"
                          hint="封面主圖一張（再傳會換掉舊的）；硬體外觀可以多張，照上傳順序排在 Hardware Overview 頁。圖片下方會自動帶「僅供參考」的註記。"
                        />
                      </section>

                      {/* ① evidence ─────────────────────────────────── */}
                      <section className="space-y-3 rounded-lg border p-5">
                        <div>
                          <h4 className="font-heading text-sm font-semibold text-[#231f20]">
                            ① 來源規格 —— 原廠說的話
                          </h4>
                          <p className="mt-1 max-w-[660px] text-xs text-muted-foreground">
                            原廠的 PDF／Excel 讀進來就長這樣，或你自己手打。
                            <strong>這一格是「原廠怎麼寫」，② 那一格是「我們決定怎麼改」。</strong>
                          </p>
                          {/* "Don't edit this" was heard as "this is
                              read-only", which is both wrong and unsafe —
                              editing works fine, and transcription errors
                              SHOULD be fixed here. What matters is which of
                              the two acts you are performing. */}
                          <div className="mt-1.5 max-w-[660px] space-y-1 text-xs text-muted-foreground">
                            <p>
                              <strong className="text-[#231f20]">這一格可以改，改了也真的會生效</strong>
                              ——但只為了一個理由：<strong>抽取讀錯了</strong>
                              （併行、漏列、值讀歪），也就是修正「原廠到底寫了什麼」的紀錄。
                            </p>
                            <p className="text-amber-800">
                              「我們決定要跟原廠不一樣」的（淨重、統一溫度、IP67）
                              <strong>一律寫成 ② 的規則</strong>。寫進這一格有兩個後果：
                              原廠那句話永遠消失、規格表上再也分不出哪格是我們改的；
                              而且哪天重新上傳來源，這一格會被整份取代，你的修改跟著不見。
                            </p>
                          </div>
                        </div>
                        <SourceExtract
                          docId={doc.id}
                          modelId={d.id}
                          modelName={d.model_name}
                          hasExistingSpecs={rowCount > 0}
                          onApplied={() => {
                            setReviewKey((k) => k + 1);
                            router.refresh();
                          }}
                        />
                        <SpecFormatHelp kind="specs" />
                        <Textarea
                          rows={12}
                          value={d.raw}
                          onChange={(e) => setDraft(d.id, { raw: e.target.value })}
                          className="font-mono text-xs"
                        />
                      </section>

                      {/* ② decisions ────────────────────────────────── */}
                      <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/40 p-5">
                        <div>
                          <h4 className="font-heading text-sm font-semibold text-[#231f20]">
                            ② 只有 {shortName} 的調整
                          </h4>
                          <p className="mt-1 max-w-[640px] text-xs text-muted-foreground">
                            寫在這裡的規則<strong>只動這一欄</strong>，其他型號不受影響。
                            值本來就一台一個的東西寫這裡——例如 EOR100 的 PoE 是 802.3af/at、
                            EOR200 只有 at。
                            <br />
                            要對<strong>每一台</strong>都生效的（「不要放 chipset」「都是 IP67」），
                            寫在上面那個「全部型號都套用的調整」。
                          </p>
                        </div>
                        <Textarea
                          rows={4}
                          value={d.rules}
                          onChange={(e) => setDraft(d.id, { rules: e.target.value })}
                          className="bg-background font-mono text-xs"
                          placeholder={"power_consumption = < 18 W"}
                        />
                        {orphan && orphan.keys.length > 0 && (
                          <p className="rounded-md border border-amber-400 bg-amber-100 px-3 py-2 text-xs text-amber-900">
                            <strong>這些規則沒有對象：</strong>
                            {orphan.keys.join("、")}。
                            來源裡找不到這些規格名（可能重新讀取後改名或消失了），所以它們現在完全不生效。
                          </p>
                        )}
                      </section>
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Everything the manager can edit, not just what it needs to draw a
 * thumbnail. Narrowing this to {slot, url} meant the caption and labels an
 * author had written were absent from the component's state, so the next
 * upload wrote the whole array back without them.
 */
/**
 * Everything the row carries, not a hand-listed subset.
 *
 * The listed version dropped a field three times — first `caption`, then
 * `labels`, then `body` — and each time the same way: the editor loaded an
 * image without it, so the panel's state started empty and the next save
 * wrote that emptiness back. Nothing errored; the bullets were simply gone
 * from the PDF.
 *
 * Spreading is the fix. A field added to `ModelImage` tomorrow survives a
 * round trip through this editor whether or not anyone remembers this
 * function exists.
 */
function parseImagesJson(value: unknown): ModelImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((i) => {
    if (!i || typeof i !== "object") return [];
    const img = i as Partial<ModelImage>;
    if (typeof img.url !== "string" || !img.url) return [];
    return [
      {
        ...img,
        slot: img.slot ?? "product",
        url: img.url,
        caption: img.caption ?? null,
        body: Array.isArray(img.body) ? img.body : [],
        labels: Array.isArray(img.labels) ? img.labels : [],
      },
    ];
  });
}

function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-[#231f20]">
            {title}
          </h2>
          {note && <p className="mt-1 max-w-[640px] text-xs text-muted-foreground">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
