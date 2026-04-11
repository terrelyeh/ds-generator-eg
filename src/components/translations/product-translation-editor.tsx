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

  // Enabled locales = locales that have a record in product_translations
  const [enabledLocales, setEnabledLocales] = useState<string[]>(
    existingTranslations.map((t) => t.locale)
  );
  const [showAddMenu, setShowAddMenu] = useState(false);

  const [activeLocale, setActiveLocale] = useState<string>(
    enabledLocales[0] ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [translatingOverview, setTranslatingOverview] = useState(false);
  const [translatingFeatures, setTranslatingFeatures] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [disabling, setDisabling] = useState(false);

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

  async function handleEnableLocale(locale: string) {
    setShowAddMenu(false);
    // Create empty record in DB to mark as enabled
    try {
      await fetch("/api/translations/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: modelName,
          locale,
          translation_mode: "light",
          overview: null,
          features: null,
        }),
      });
      setEnabledLocales((prev) => [...prev, locale]);
      switchLocale(locale);
      setDirty(false);
      router.refresh();
      toast.success(`${SUPPORTED_LOCALES.find((l) => l.value === locale)?.label} enabled`);
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDisableLocale(locale: string) {
    const localeLabel = SUPPORTED_LOCALES.find((l) => l.value === locale)?.label ?? locale;
    if (!confirm(`Disable ${localeLabel}? This will delete all translations for this language.`)) return;

    setDisabling(true);
    try {
      const res = await fetch("/api/translations/product", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: modelName, locale }),
      });
      const data = await res.json();
      if (data.ok) {
        setEnabledLocales((prev) => prev.filter((l) => l !== locale));
        // Switch to another locale or clear
        const remaining = enabledLocales.filter((l) => l !== locale);
        if (remaining.length > 0) {
          switchLocale(remaining[0]);
        } else {
          setActiveLocale("");
        }
        setDirty(false);
        router.refresh();
        toast.success(`${localeLabel} disabled`);
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDisabling(false);
    }
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

  async function handlePreview() {
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
      window.open(`/preview/${modelName}?lang=${activeLocale}&mode=${mode}`, "_blank");
    } finally {
      setPreviewing(false);
    }
  }

  const currentLocaleInfo = SUPPORTED_LOCALES.find((l) => l.value === activeLocale);
  const availableToAdd = localeOptions.filter((l) => !enabledLocales.includes(l.value));

  // --- No languages enabled state ---
  if (enabledLocales.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 py-16 px-8">
          <svg className="h-12 w-12 text-muted-foreground/30 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
            <path d="M3.6 9h16.8M3.6 15h16.8" />
            <path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9Z" />
          </svg>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            No languages enabled for this product
          </p>
          <p className="text-xs text-muted-foreground/60 mb-6">
            Enable a language to start translating the datasheet
          </p>
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setShowAddMenu(!showAddMenu)}
            >
              + Enable Language
            </Button>
            {showAddMenu && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full z-10 mt-2 w-52 rounded-md border bg-popover p-1 shadow-md">
                {localeOptions.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => handleEnableLocale(l.value)}
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <span>{l.flag}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Languages enabled, show editor ---
  return (
    <div className="space-y-6">
      {/* Language tabs + controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Language tabs */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {enabledLocales.map((loc) => {
              const info = SUPPORTED_LOCALES.find((l) => l.value === loc);
              if (!info) return null;
              return (
                <button
                  key={loc}
                  onClick={() => switchLocale(loc)}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                    activeLocale === loc
                      ? "bg-engenius-blue text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background"
                  }`}
                >
                  {info.flag} {info.label}
                </button>
              );
            })}
          </div>

          {/* Add language button */}
          {availableToAdd.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Add
              </button>
              {showAddMenu && (
                <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
                  {availableToAdd.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => handleEnableLocale(l.value)}
                      className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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

          {/* AI Model selector */}
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
              {currentLocaleInfo?.flag} {currentLocaleInfo?.label}
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
                      {currentLocaleInfo?.flag} {currentLocaleInfo?.label}
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

      {/* Disable language */}
      <div className="flex justify-end">
        <button
          onClick={() => handleDisableLocale(activeLocale)}
          disabled={disabling}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {disabling ? "Removing..." : `Disable ${currentLocaleInfo?.label ?? activeLocale}`}
        </button>
      </div>
    </div>
  );
}
