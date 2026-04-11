"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORTED_LOCALES } from "@/lib/datasheet/locales";
import { AVAILABLE_PROVIDERS } from "@/lib/translate/types";
import { useProviders } from "@/lib/translate/use-providers";

interface SpecLabelTranslationsEditorProps {
  productLineId: string;
  productLineLabel: string;
  locale: string;
  sectionNames: string[];
  sectionLabelsMap: Record<string, string[]>;
  initialTranslations: Record<string, string>; // "spec:label" or "section:label" → translated
}

export function SpecLabelTranslationsEditor({
  productLineId,
  productLineLabel,
  locale,
  sectionNames,
  sectionLabelsMap,
  initialTranslations,
}: SpecLabelTranslationsEditorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [translations, setTranslations] = useState<Record<string, string>>(initialTranslations);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [aiTranslating, setAiTranslating] = useState(false);

  const { availability, selectedProvider, setSelectedProvider, hasAnyProvider } = useProviders();

  const localeOptions = SUPPORTED_LOCALES.filter((l) => l.value !== "en");
  const currentLocale = localeOptions.find((l) => l.value === locale) ?? localeOptions[0];

  function handleChange(key: string, value: string) {
    setTranslations((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleLocaleChange(newLocale: string) {
    if (dirty && !confirm("You have unsaved changes. Switch language anyway?")) return;
    router.push(`${pathname}?locale=${newLocale}`);
  }

  async function handleAiTranslateEmpty() {
    // Collect all empty labels (both section and spec)
    const emptySection = sectionNames.filter((n) => !translations[`section:${n}`]?.trim());
    const emptySpec = Object.values(sectionLabelsMap).flat().filter((l) => !translations[`spec:${l}`]?.trim());

    if (emptySection.length === 0 && emptySpec.length === 0) {
      toast.info("All fields are already filled");
      return;
    }

    setAiTranslating(true);
    try {
      // Translate section headers
      if (emptySection.length > 0) {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: emptySection.join("\n"),
            target_locale: locale,
            content_type: "spec_labels",
            product_line: productLineLabel,
            provider: selectedProvider,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          const lines = (data.translated as string).split("\n").filter((l: string) => l.trim());
          const updated = { ...translations };
          emptySection.forEach((name, i) => {
            if (lines[i]) updated[`section:${name}`] = lines[i];
          });
          setTranslations(updated);
        }
      }

      // Translate spec labels
      if (emptySpec.length > 0) {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: emptySpec.join("\n"),
            target_locale: locale,
            content_type: "spec_labels",
            product_line: productLineLabel,
            provider: selectedProvider,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          const lines = (data.translated as string).split("\n").filter((l: string) => l.trim());
          setTranslations((prev) => {
            const updated = { ...prev };
            emptySpec.forEach((label, i) => {
              if (lines[i]) updated[`spec:${label}`] = lines[i];
            });
            return updated;
          });
        }
      }

      setDirty(true);
      toast.success(`AI translated ${emptySection.length + emptySpec.length} empty fields`);
    } catch (err) {
      toast.error(`AI translation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiTranslating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const items: { original_label: string; translated_label: string; label_type: "spec" | "section" }[] = [];

      for (const [key, value] of Object.entries(translations)) {
        if (!value || value.trim().length === 0) continue;
        const [type, ...labelParts] = key.split(":");
        items.push({
          original_label: labelParts.join(":"),
          translated_label: value,
          label_type: type as "spec" | "section",
        });
      }

      const res = await fetch("/api/translations/spec-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_line_id: productLineId,
          locale,
          translations: items,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        toast.success(`Saved ${data.saved} translations`);
        setDirty(false);
        router.refresh();
      } else {
        toast.error(`Save failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  // Count progress
  const totalLabels = sectionNames.length + Object.values(sectionLabelsMap).flat().length;
  const filledLabels = Object.values(translations).filter((v) => v && v.trim().length > 0).length;

  return (
    <div className="space-y-6">
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">Language:</label>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {localeOptions.map((l) => (
              <button
                key={l.value}
                onClick={() => handleLocaleChange(l.value)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                  locale === l.value
                    ? "bg-engenius-blue text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background"
                }`}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-engenius-blue transition-all"
                style={{ width: `${totalLabels > 0 ? (filledLabels / totalLabels) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {filledLabels}/{totalLabels}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              {AVAILABLE_PROVIDERS.map((p) => {
                const available = availability[p.id];
                return (
                  <option key={p.id} value={p.id} disabled={!available}>
                    {available ? "✓ " : "✗ "}{p.name}{!available ? " (no key)" : ""}
                  </option>
                );
              })}
            </select>
            <Button
              onClick={handleAiTranslateEmpty}
              disabled={aiTranslating || !hasAnyProvider}
              size="default"
              className={`transition-all ${
                aiTranslating
                  ? "bg-amber-500 hover:bg-amber-500 text-white animate-pulse"
                  : ""
              }`}
            >
              {aiTranslating ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 1a7 7 0 1 0 7 7" />
                  </svg>
                  正在翻譯中...
                </span>
              ) : (
                "AI Translate Empty Fields"
              )}
            </Button>
          </div>

          <Button onClick={handleSave} disabled={saving || !dirty} size="default">
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>

      {/* Warning banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Spec labels are shared across all models in <strong>{productLineLabel}</strong>.
        Changes here affect every product in this line.
      </div>

      {/* Section headers */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Section Headers</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[40%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-foreground/10">
                <th className="py-2 text-left text-xs font-semibold text-muted-foreground">English</th>
                <th className="py-2 text-left text-xs font-semibold text-muted-foreground">
                  {currentLocale.flag} {currentLocale.label}
                </th>
                <th className="py-2 text-left text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {sectionNames.map((name) => {
                const key = `section:${name}`;
                const value = translations[key] ?? "";
                return (
                  <tr key={key} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-sm font-medium text-muted-foreground">{name}</td>
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={name}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                      />
                    </td>
                    <td className="py-2">
                      {value.trim() ? (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      ) : (
                        <span className="text-xs text-muted-foreground/40">&mdash;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Spec labels by section */}
      {sectionNames.map((sectionName) => {
        const labels = sectionLabelsMap[sectionName] ?? [];
        if (labels.length === 0) return null;

        return (
          <Card key={sectionName} className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{sectionName}</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[40%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-foreground/10">
                    <th className="py-2 text-left text-xs font-semibold text-muted-foreground">English</th>
                    <th className="py-2 text-left text-xs font-semibold text-muted-foreground">
                      {currentLocale.flag} {currentLocale.label}
                    </th>
                    <th className="py-2 text-left text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {labels.map((label) => {
                    const key = `spec:${label}`;
                    const value = translations[key] ?? "";
                    return (
                      <tr key={key} className="border-b border-border/50">
                        <td className="py-2 pr-4 text-sm font-medium text-muted-foreground">{label}</td>
                        <td className="py-2 pr-4">
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => handleChange(key, e.target.value)}
                            placeholder={label}
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                          />
                        </td>
                        <td className="py-2">
                          {value.trim() ? (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          ) : (
                            <span className="text-xs text-muted-foreground/40">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
