"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SUPPORTED_LOCALES } from "@/lib/datasheet/locales";
import { AVAILABLE_PROVIDERS } from "@/lib/translate/types";
import { useProviders } from "@/lib/translate/use-providers";

interface TranslationData {
  locale: string;
  translation_mode: "light" | "full";
  overview: string | null;
  features: string[] | null;
}

interface ProductTranslationEditorProps {
  modelName: string;
  productLineName: string;
  englishOverview: string;
  englishFeatures: string[];
  existingTranslations: TranslationData[];
}

export function ProductTranslationEditor({
  modelName,
  productLineName,
  englishOverview,
  englishFeatures,
  existingTranslations,
}: ProductTranslationEditorProps) {
  const router = useRouter();
  const localeOptions = SUPPORTED_LOCALES.filter((l) => l.value !== "en");

  const [activeLocale, setActiveLocale] = useState<string>(localeOptions[0]?.value ?? "ja");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [translatingOverview, setTranslatingOverview] = useState(false);
  const [translatingFeatures, setTranslatingFeatures] = useState(false);

  const { availability, selectedProvider, setSelectedProvider, hasAnyProvider } = useProviders();

  // Build state from existing translations
  const existing = existingTranslations.find((t) => t.locale === activeLocale);
  const [mode, setMode] = useState<"light" | "full">(existing?.translation_mode ?? "light");
  const [overview, setOverview] = useState(existing?.overview ?? "");
  const [features, setFeatures] = useState<string[]>(
    existing?.features ?? englishFeatures.map(() => "")
  );

  function switchLocale(locale: string) {
    if (dirty && !confirm("You have unsaved changes. Switch language anyway?")) return;
    setActiveLocale(locale);
    const t = existingTranslations.find((t) => t.locale === locale);
    setMode(t?.translation_mode ?? "light");
    setOverview(t?.overview ?? "");
    setFeatures(t?.features ?? englishFeatures.map(() => ""));
    setDirty(false);
  }

  function handleFeatureChange(index: number, value: string) {
    const updated = [...features];
    updated[index] = value;
    setFeatures(updated);
    setDirty(true);
  }

  async function handleAiTranslateOverview() {
    if (!englishOverview) return;
    setTranslatingOverview(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: englishOverview,
          target_locale: activeLocale,
          content_type: "overview",
          product_line: productLineName,
          provider: selectedProvider,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setOverview(data.translated);
        setDirty(true);
        toast.success(`Overview translated by ${data.provider}`);
      } else {
        toast.error(`Translation failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Translation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTranslatingOverview(false);
    }
  }

  async function handleAiTranslateFeatures() {
    if (englishFeatures.length === 0) return;
    setTranslatingFeatures(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: englishFeatures.join("\n"),
          target_locale: activeLocale,
          content_type: "features",
          product_line: productLineName,
          provider: selectedProvider,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const lines = (data.translated as string).split("\n").filter((l: string) => l.trim());
        const result = englishFeatures.map((_, i) => lines[i] ?? "");
        setFeatures(result);
        setDirty(true);
        toast.success(`${lines.length} features translated by ${data.provider}`);
      } else {
        toast.error(`Translation failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Translation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTranslatingFeatures(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/translations/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: modelName,
          locale: activeLocale,
          translation_mode: mode,
          overview: overview || null,
          features: features.some((f) => f.trim()) ? features : null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Translation saved");
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

  const [previewing, setPreviewing] = useState(false);

  async function handlePreview() {
    // Auto-save before opening preview so the preview page can read from DB
    setPreviewing(true);
    try {
      await fetch("/api/translations/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: modelName,
          locale: activeLocale,
          translation_mode: mode,
          overview: overview || null,
          features: features.some((f) => f.trim()) ? features : null,
        }),
      });
      setDirty(false);
      window.open(`/preview/${modelName}?lang=${activeLocale}&mode=${mode}`, "_blank");
    } catch {
      // Even if save fails, still try to open preview
      window.open(`/preview/${modelName}?lang=${activeLocale}&mode=${mode}`, "_blank");
    } finally {
      setPreviewing(false);
    }
  }

  const currentLocaleInfo = SUPPORTED_LOCALES.find((l) => l.value === activeLocale)!;
  const isTranslating = translatingOverview || translatingFeatures;

  return (
    <div className="space-y-6">
      {/* Language selector + mode */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {localeOptions.map((l) => (
              <button
                key={l.value}
                onClick={() => switchLocale(l.value)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                  activeLocale === l.value
                    ? "bg-engenius-blue text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background"
                }`}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>

          <Separator orientation="vertical" className="h-6" />

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Mode:</label>
            <select
              value={mode}
              onChange={(e) => { setMode(e.target.value as "light" | "full"); setDirty(true); }}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              <option value="light">Light (Headers only)</option>
              <option value="full">Full (+ Spec Labels)</option>
            </select>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* AI Model selector with availability */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">AI Model:</label>
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
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePreview}
            disabled={previewing}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent transition-colors disabled:opacity-50"
          >
            {previewing ? "Saving..." : "Preview"}
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 3h8v8M13 3 6 10" />
            </svg>
          </button>
          <Button onClick={handleSave} disabled={saving || !dirty} size="sm">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* No provider warning */}
      {!hasAnyProvider && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No AI translation API keys configured.{" "}
          <Link href="/settings" className="font-medium underline hover:text-amber-900">
            Go to Settings
          </Link>{" "}
          to add one, or enter translations manually below.
        </div>
      )}

      {/* Overview */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Overview</CardTitle>
          <Button
            size="sm"
            onClick={handleAiTranslateOverview}
            disabled={translatingOverview || !englishOverview || !hasAnyProvider}
            className={`text-xs transition-all ${
              translatingOverview
                ? "bg-amber-500 hover:bg-amber-500 text-white animate-pulse"
                : ""
            }`}
          >
            {translatingOverview ? (
              <span className="flex items-center gap-1.5">
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 1a7 7 0 1 0 7 7" />
                </svg>
                正在翻譯中...
              </span>
            ) : (
              "AI Translate"
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">English (source)</label>
            <p className="mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground leading-relaxed">
              {englishOverview || <span className="italic">No overview</span>}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {currentLocaleInfo.flag} {currentLocaleInfo.label}
            </label>
            <textarea
              value={overview}
              onChange={(e) => { setOverview(e.target.value); setDirty(true); }}
              placeholder="Enter translated overview..."
              rows={4}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30 transition-colors ${
                translatingOverview
                  ? "border-amber-300 bg-amber-50"
                  : "border-input bg-background"
              }`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Features &amp; Benefits</CardTitle>
          <Button
            size="sm"
            onClick={handleAiTranslateFeatures}
            disabled={translatingFeatures || englishFeatures.length === 0 || !hasAnyProvider}
            className={`text-xs transition-all ${
              translatingFeatures
                ? "bg-amber-500 hover:bg-amber-500 text-white animate-pulse"
                : ""
            }`}
          >
            {translatingFeatures ? (
              <span className="flex items-center gap-1.5">
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 1a7 7 0 1 0 7 7" />
                </svg>
                正在翻譯中...
              </span>
            ) : (
              "AI Translate"
            )}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {englishFeatures.map((engFeature, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <div>
                  {i === 0 && (
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">English</label>
                  )}
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground leading-relaxed">
                    {engFeature}
                  </p>
                </div>
                <div>
                  {i === 0 && (
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {currentLocaleInfo.flag} {currentLocaleInfo.label}
                    </label>
                  )}
                  <input
                    type="text"
                    value={features[i] ?? ""}
                    onChange={(e) => handleFeatureChange(i, e.target.value)}
                    placeholder="Translated feature..."
                    className={`w-full rounded-md border px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30 transition-colors ${
                      translatingFeatures
                        ? "border-amber-300 bg-amber-50"
                        : "border-input bg-background"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Spec labels link */}
      {mode === "full" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Full mode is enabled. Spec labels are managed at the product line level:{" "}
          <Link
            href={`/translations/${encodeURIComponent(productLineName)}?locale=${activeLocale}`}
            className="font-medium underline hover:text-blue-900"
          >
            Edit Spec Labels for {productLineName}
          </Link>
        </div>
      )}
    </div>
  );
}
