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

/** Safe JSON parse for API responses — handles non-JSON error pages */
async function safeJson(res: Response): Promise<{ ok?: boolean; translated?: string; notes?: string; provider?: string; error?: string }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

/** Collapsible panel showing AI translation notes */
function TranslationNotes({
  notes,
  onDismiss,
  className = "",
}: {
  notes: string;
  onDismiss: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`rounded-lg border border-indigo-200 bg-indigo-50 overflow-hidden transition-all ${className}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm6.5-.25A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          翻譯筆記
        </span>
        <span className="flex items-center gap-2">
          <svg
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 5l3 3 3-3" />
          </svg>
          <span
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="text-indigo-400 hover:text-indigo-600 transition-colors"
            title="Dismiss"
          >
            ✕
          </span>
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-xs text-indigo-700 leading-relaxed whitespace-pre-wrap">
          {notes}
        </div>
      )}
    </div>
  );
}

interface TranslationData {
  locale: string;
  translation_mode: "light" | "full";
  overview: string | null;
  features: string[] | null;
  headline: string | null;
  subtitle: string | null;
  hardware_image: string | null;
  qr_label: string | null;
  qr_url: string | null;
  confirmed: boolean;
}

interface ProductTranslationEditorProps {
  modelName: string;
  englishHeadline: string;
  englishSubtitle: string;
  productLineName: string;
  englishOverview: string;
  englishFeatures: string[];
  existingTranslations: TranslationData[];
}

export function ProductTranslationEditor({
  modelName,
  englishHeadline,
  englishSubtitle,
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
  // Track which locales have been confirmed (explicitly Saved)
  const [confirmedLocales, setConfirmedLocales] = useState<Set<string>>(
    new Set(existingTranslations.filter((t) => t.confirmed).map((t) => t.locale))
  );
  const [showAddMenu, setShowAddMenu] = useState(false);

  const [activeLocale, setActiveLocale] = useState<string>(
    enabledLocales[0] ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [translatingHeadline, setTranslatingHeadline] = useState(false);
  const [translatingOverview, setTranslatingOverview] = useState(false);
  const [translatingFeatures, setTranslatingFeatures] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const { availability, selectedProvider, setSelectedProvider, hasAnyProvider } = useProviders();

  // Translation notes from AI
  const [headlineNotes, setHeadlineNotes] = useState("");
  const [overviewNotes, setOverviewNotes] = useState("");
  const [featuresNotes, setFeaturesNotes] = useState("");

  // Build state from existing translations
  const existing = existingTranslations.find((t) => t.locale === activeLocale);
  const [mode, setMode] = useState<"light" | "full">(existing?.translation_mode ?? "light");
  const [headlineTrans, setHeadlineTrans] = useState(existing?.headline ?? "");
  const [subtitleTrans, setSubtitleTrans] = useState(existing?.subtitle ?? "");
  const [overview, setOverview] = useState(existing?.overview ?? "");
  const [features, setFeatures] = useState<string[]>(
    existing?.features ?? englishFeatures.map(() => "")
  );
  const [hwImage, setHwImage] = useState(existing?.hardware_image ?? "");
  const [hwUploading, setHwUploading] = useState(false);
  const [qrLabel, setQrLabel] = useState(existing?.qr_label ?? "");
  const [qrUrl, setQrUrl] = useState(existing?.qr_url ?? "");

  function switchLocale(locale: string) {
    if (dirty && !confirm("You have unsaved changes. Switch language anyway?")) return;
    setActiveLocale(locale);
    const t = existingTranslations.find((t) => t.locale === locale);
    setMode(t?.translation_mode ?? "light");
    setHeadlineTrans(t?.headline ?? "");
    setSubtitleTrans(t?.subtitle ?? "");
    setOverview(t?.overview ?? "");
    setFeatures(t?.features ?? englishFeatures.map(() => ""));
    setHwImage(t?.hardware_image ?? "");
    setQrLabel(t?.qr_label ?? "");
    setQrUrl(t?.qr_url ?? "");
    setHeadlineNotes("");
    setOverviewNotes("");
    setFeaturesNotes("");
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
      const data = await safeJson(res);
      if (data.ok) {
        setOverview(data.translated ?? "");
        setOverviewNotes(data.notes || "");
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
      const data = await safeJson(res);
      if (data.ok) {
        const lines = (data.translated as string).split("\n").filter((l: string) => l.trim());
        const result = englishFeatures.map((_, i) => lines[i] ?? "");
        setFeatures(result);
        setFeaturesNotes(data.notes || "");
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
          headline: headlineTrans || null,
          subtitle: subtitleTrans || null,
          overview: overview || null,
          features: features.some((f) => f.trim()) ? features : null,
          hardware_image: hwImage || null,
          qr_label: qrLabel || null,
          qr_url: qrUrl || null,
          confirm: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfirmedLocales((prev) => new Set([...prev, activeLocale]));

        // Detect existing Drive version for this locale (syncs to DB)
        if (!confirmedLocales.has(activeLocale)) {
          fetch(`/api/detect-locale-version?model=${encodeURIComponent(modelName)}&lang=${activeLocale}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.version) {
                toast.success(
                  `${currentLocaleInfo?.label} confirmed — detected existing v${d.version} from Drive`
                );
              } else {
                toast.success(
                  `${currentLocaleInfo?.label} translation confirmed — PDF generation is now available`
                );
              }
            })
            .catch(() => {
              toast.success(
                `${currentLocaleInfo?.label} translation confirmed — PDF generation is now available`
              );
            });
        } else {
          toast.success("Translation updated");
        }

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
          headline: headlineTrans || null,
          subtitle: subtitleTrans || null,
          overview: overview || null,
          features: features.some((f) => f.trim()) ? features : null,
          hardware_image: hwImage || null,
          qr_label: qrLabel || null,
          qr_url: qrUrl || null,
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

          <Separator orientation="vertical" className="h-6" />

          <Link
            href={`/settings/glossary?locale=${activeLocale}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Translation Glossary"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
            </svg>
            Glossary
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* Draft / Confirmed badge */}
          {confirmedLocales.has(activeLocale) ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
              Confirmed
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
              Draft
            </span>
          )}

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
            {saving ? "Saving..." : "Save & Confirm"}
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

      {/* Product Headline */}
      <Card className="shadow-sm">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Product Headline</CardTitle>
          <Button
            size="sm"
            onClick={async () => {
              if (!englishHeadline) return;
              setTranslatingHeadline(true);
              try {
                const res = await fetch("/api/translate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    source: englishHeadline,
                    target_locale: activeLocale,
                    content_type: "headline",
                    product_line: productLineName,
                    provider: selectedProvider,
                  }),
                });
                const data = await safeJson(res);
                if (data.ok) {
                  setHeadlineTrans(data.translated ?? "");
                  setHeadlineNotes(data.notes || "");
                  setDirty(true);
                  toast.success(`Headline translated by ${data.provider}`);
                } else {
                  toast.error(`Translation failed: ${data.error}`);
                }
              } catch (err) {
                toast.error(`Translation failed: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setTranslatingHeadline(false);
              }
            }}
            disabled={translatingHeadline || !englishHeadline || !hasAnyProvider}
            className={`text-xs transition-all ${
              translatingHeadline
                ? "bg-amber-500 hover:bg-amber-500 text-white animate-pulse"
                : ""
            }`}
          >
            {translatingHeadline ? (
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
          </div>
          <p className="text-[11px] text-muted-foreground/60">
            用 <code className="rounded bg-muted px-1 text-[11px]">**粗體文字**</code> 標記粗體部分。按 Enter 手動斷行，或寫成一行讓系統自動斷行。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">English (source)</label>
            <p className="mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {englishHeadline || <span className="italic">No headline</span>}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {currentLocaleInfo?.flag} {currentLocaleInfo?.label}
            </label>
            <textarea
              value={headlineTrans}
              onChange={(e) => { setHeadlineTrans(e.target.value); setDirty(true); }}
              placeholder="Translated headline..."
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30 resize-none"
            />
          </div>
          {headlineNotes && <TranslationNotes notes={headlineNotes} onDismiss={() => setHeadlineNotes("")} />}
        </CardContent>
      </Card>

      {/* Subtitle */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Subtitle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">English (source)</label>
            <p className="mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {englishSubtitle || <span className="italic">No subtitle</span>}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {currentLocaleInfo?.flag} {currentLocaleInfo?.label}
              <span className="ml-2 text-muted-foreground/40">(leave empty to use English)</span>
            </label>
            <input
              type="text"
              value={subtitleTrans}
              onChange={(e) => { setSubtitleTrans(e.target.value); setDirty(true); }}
              placeholder={englishSubtitle}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
            />
          </div>
        </CardContent>
      </Card>

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
          {overviewNotes && <TranslationNotes notes={overviewNotes} onDismiss={() => setOverviewNotes("")} />}
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
          {featuresNotes && <TranslationNotes notes={featuresNotes} onDismiss={() => setFeaturesNotes("")} className="mt-4" />}
        </CardContent>
      </Card>

      {/* Hardware Image (locale-specific) */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Hardware Image</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Upload a locale-specific hardware image with translated labels. If empty, the English version will be used.
          </p>
          <div className="flex items-center gap-4">
            {hwImage ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hwImage} alt="Hardware" className="h-24 w-auto rounded border object-contain" />
                <button
                  onClick={() => { setHwImage(""); setDirty(true); }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex h-24 w-32 items-center justify-center rounded border-2 border-dashed border-muted-foreground/20 bg-muted/30 text-xs text-muted-foreground/40">
                No image
              </div>
            )}
            <label>
              <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent transition-colors">
                {hwUploading ? "Uploading..." : hwImage ? "Replace" : "Upload"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={hwUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setHwUploading(true);
                  try {
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("model", modelName);
                    formData.append("type", "hardware");
                    formData.append("locale", activeLocale);
                    const res = await fetch("/api/upload-image", { method: "POST", body: formData });
                    const data = await res.json();
                    if (data.ok && data.url) {
                      setHwImage(data.url);
                      setDirty(true);
                      toast.success("Hardware image uploaded");
                    } else {
                      toast.error(`Upload failed: ${data.error || "Unknown error"}`);
                    }
                  } catch (err) {
                    toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
                  } finally {
                    setHwUploading(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Settings */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">QR Code (Footer)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                QR Label <span className="text-muted-foreground/40">(default: {SUPPORTED_LOCALES.find(l => l.value === activeLocale)?.value === "en" ? "Quick Start Guide" : "Contact Us"})</span>
              </label>
              <input
                type="text"
                value={qrLabel}
                onChange={(e) => { setQrLabel(e.target.value); setDirty(true); }}
                placeholder="Contact Us"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                QR URL <span className="text-muted-foreground/40">(leave empty for default)</span>
              </label>
              <input
                type="text"
                value={qrUrl}
                onChange={(e) => { setQrUrl(e.target.value); setDirty(true); }}
                placeholder="https://www.engenius.co.jp/contact"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
              />
            </div>
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
