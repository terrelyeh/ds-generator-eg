"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { layoutOptions } from "@/lib/project-datasheet/themes";
import { asRawDoc, asRules, findOrphanedRules, mergeRules } from "@/lib/project-datasheet/resolve";
import {
  parseFeatureBlocks,
  parseImages,
  parseRules,
  parseSpecRows,
  serializeFeatureBlocks,
  serializeImages,
  serializeRules,
  serializeSpecRows,
} from "@/lib/project-datasheet/text-format";
import { DEFAULT_SECTIONS } from "@/lib/project-datasheet/types";
import type { SectionToggles } from "@/lib/project-datasheet/types";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

const SECTION_LABELS: { key: keyof SectionToggles; label: string; hint: string }[] = [
  { key: "features", label: "Features & Benefits", hint: "the marketing page" },
  { key: "specs", label: "Technical Specifications", hint: "the comparison matrix" },
  { key: "software", label: "Software Features", hint: "rows marked ## software" },
  { key: "hardware", label: "Hardware Overview", hint: "the non-cover renders" },
  { key: "package", label: "Package Contents", hint: "rows marked ## package" },
  { key: "diagram", label: "Deployment diagram", hint: "the document image slot 'diagram'" },
];

interface ModelDraft {
  id: string;
  model_name: string;
  display_name: string;
  images: string;
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

  // Document fields
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
      Array.isArray(doc.features)
        ? (doc.features as { title: string; bullets: string[] }[])
        : [],
    ),
  );
  const [docImages, setDocImages] = useState(() =>
    serializeImages(parseImagesJson(doc.images)),
  );
  const [disclaimer, setDisclaimer] = useState(doc.disclaimer);
  const [imageNote, setImageNote] = useState(doc.image_note ?? "");
  const [blankPolicy, setBlankPolicy] = useState(doc.blank_policy);
  const [docRules, setDocRules] = useState(() => serializeRules(asRules(doc.doc_rules)));
  const [sections, setSections] = useState<SectionToggles>({
    ...DEFAULT_SECTIONS,
    ...((doc.sections as Partial<SectionToggles>) ?? {}),
  });

  const [drafts, setDrafts] = useState<ModelDraft[]>(() =>
    models.map((m) => ({
      id: m.id,
      model_name: m.model_name,
      display_name: m.display_name ?? "",
      images: serializeImages(parseImagesJson(m.images)),
      raw: serializeSpecRows(asRawDoc(m.raw_doc)),
      rules: serializeRules(asRules(m.rules)),
    })),
  );

  /**
   * Rules that no longer match any row. Shown here rather than swallowed
   * because the failure mode is silent and serious: an override that stops
   * applying puts the chipset back on the page without anything looking wrong.
   */
  const orphans = useMemo(
    () =>
      drafts.map((d) => ({
        model: d.model_name,
        keys: findOrphanedRules(
          parseSpecRows(d.raw),
          mergeRules(parseRules(docRules), parseRules(d.rules)),
        ),
      })),
    [drafts, docRules],
  );

  function setDraft(id: string, patch: Partial<ModelDraft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  async function save() {
    if (!disclaimer.trim()) {
      toast.error("The PRELIMINARY notice cannot be empty — reword it instead.");
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
          images: parseImages(docImages),
          disclaimer,
          image_note: imageNote || null,
          blank_policy: blankPolicy,
          doc_rules: parseRules(docRules),
          sections,
        }),
      });
      const docJson = await docRes.json();
      if (!docRes.ok) throw new Error(docJson.error ?? "Save failed");

      for (const d of drafts) {
        const res = await fetch(`/api/projects/${doc.id}/models`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: d.id,
            model_name: d.model_name,
            display_name: d.display_name || null,
            images: parseImages(d.images),
            raw_doc: parseSpecRows(d.raw),
            rules: parseRules(d.rules),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Save failed for ${d.model_name}`);
      }

      toast.success("Saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addModel() {
    const modelName = window.prompt("Model name (e.g. EOR100)")?.trim();
    if (!modelName) return;
    const res = await fetch(`/api/projects/${doc.id}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_name: modelName }),
    });
    const json = await res.json();
    if (!res.ok) return toast.error(json.error ?? "Could not add model");
    router.refresh();
  }

  async function removeModel(id: string, modelName: string) {
    if (!window.confirm(`Remove ${modelName} from this datasheet?`)) return;
    const res = await fetch(`/api/projects/${doc.id}/models`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok) return toast.error(json.error ?? "Could not remove model");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
            ← Datasheet on Demand
          </Link>
          <h1 className="mt-1 truncate font-heading text-2xl font-semibold text-[#231f20]">
            {doc.name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/preview/project/${doc.id}`}
            target="_blank"
            className={buttonVariants({ variant: "outline" })}
          >
            Preview
          </Link>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Panel title="Document">
        <Grid>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Customer">
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </Field>
          <Field label="Layout">
            <Select value={layout} onChange={setLayout} options={layoutOptions()} />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: "draft", label: "Draft" },
                { value: "ready", label: "Ready to send" },
                { value: "archived", label: "Archived" },
              ]}
            />
          </Field>
        </Grid>
      </Panel>

      <Panel title="Cover">
        <Grid>
          <Field label="Headline">
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
          <Field label="Series name">
            <Input value={seriesName} onChange={(e) => setSeriesName(e.target.value)} />
          </Field>
          <Field label="Category label" hint="the small caps label in the blue band">
            <Input value={categoryLabel} onChange={(e) => setCategoryLabel(e.target.value)} />
          </Field>
        </Grid>
        <Field label="Overview">
          <Textarea rows={6} value={overview} onChange={(e) => setOverview(e.target.value)} />
        </Field>
        <Field
          label="Features & Benefits"
          hint="one block per paragraph — first line is the title, the rest are bullets"
        >
          <Textarea rows={10} value={features} onChange={(e) => setFeatures(e.target.value)} />
        </Field>
        <Field label="Footnote">
          <Input value={footnote} onChange={(e) => setFootnote(e.target.value)} />
        </Field>
        <Field
          label="Document images"
          hint="one per line: `slot url`. Slot `diagram` renders on the deployment page."
        >
          <Textarea rows={3} value={docImages} onChange={(e) => setDocImages(e.target.value)} />
        </Field>
      </Panel>

      <Panel
        title="Notices"
        note="Both of these ride on the printed document. The wording is yours; whether there is one is not."
      >
        <Field
          label="PRELIMINARY notice"
          hint="prints on the cover and in the footer — cannot be empty"
        >
          <Textarea
            rows={3}
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
            aria-invalid={!disclaimer.trim()}
          />
        </Field>
        <Field
          label="Image note"
          hint="prints under the hardware renders whenever the document has images"
        >
          <Input value={imageNote} onChange={(e) => setImageNote(e.target.value)} />
        </Field>
      </Panel>

      <Panel title="Sections" note="Turn off what does not exist yet rather than printing it empty.">
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
        <Field
          label="Empty cells"
          hint="what to print where the source never gave a value"
        >
          <Select
            value={blankPolicy}
            onChange={setBlankPolicy}
            options={[
              { value: "tbd", label: "TBD — we expect an answer later" },
              { value: "na", label: "— (em dash) — not applicable" },
              { value: "blank", label: "Leave blank" },
            ]}
          />
        </Field>
      </Panel>

      <Panel
        title="Document rules"
        note="Requirements that are about the whole document — 'don't show the chipset', 'it's IP67'. Per-model rules layer on top; a row hidden here stays hidden everywhere."
      >
        <Field label="Rules" hint={RULES_HINT}>
          <Textarea
            rows={7}
            value={docRules}
            onChange={(e) => setDocRules(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
      </Panel>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-[#231f20]">
            Models ({drafts.length})
          </h2>
          <Button variant="outline" size="sm" onClick={addModel}>
            Add model
          </Button>
        </div>

        {drafts.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Add at least one model — it becomes a column in the spec table.
          </div>
        )}

        {drafts.map((d) => {
          const orphan = orphans.find((o) => o.model === d.model_name);
          return (
            <Panel
              key={d.id}
              title={d.model_name}
              action={
                <button
                  type="button"
                  onClick={() => removeModel(d.id, d.model_name)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              }
            >
              <Grid>
                <Field label="Model name">
                  <Input
                    value={d.model_name}
                    onChange={(e) => setDraft(d.id, { model_name: e.target.value })}
                  />
                </Field>
                <Field label="Description" hint="prints under the cover shot and in the table">
                  <Input
                    value={d.display_name}
                    onChange={(e) => setDraft(d.id, { display_name: e.target.value })}
                  />
                </Field>
              </Grid>
              <Field
                label="Images"
                hint="one per line: `slot url`. Slot `product` is the cover shot; anything else goes on the hardware page."
              >
                <Textarea
                  rows={3}
                  value={d.images}
                  onChange={(e) => setDraft(d.id, { images: e.target.value })}
                  className="font-mono text-xs"
                />
              </Field>
              <Field
                label="Source specs"
                hint="paste the supplier table: `label ⇥ value`, a line starting with a tab continues the value above, `## software` / `## package` start a new table"
              >
                <Textarea
                  rows={12}
                  value={d.raw}
                  onChange={(e) => setDraft(d.id, { raw: e.target.value })}
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Model rules" hint={RULES_HINT}>
                <Textarea
                  rows={5}
                  value={d.rules}
                  onChange={(e) => setDraft(d.id, { rules: e.target.value })}
                  className="font-mono text-xs"
                />
              </Field>
              {orphan && orphan.keys.length > 0 && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <strong>Rules matching nothing:</strong> {orphan.keys.join(", ")}. They have no
                  effect — the source rows they name are gone or renamed.
                </p>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

const RULES_HINT =
  "`- key` hides · `key = value` overrides or invents · `~ key = Label` renames · `+ Label = value` adds · `? key = tbd|na|blank` sets an empty cell";

function parseImagesJson(value: unknown): { slot: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((i) =>
    i && typeof i === "object" && typeof (i as { url?: string }).url === "string"
      ? [{ slot: (i as { slot?: string }).slot ?? "product", url: (i as { url: string }).url }]
      : [],
  );
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
