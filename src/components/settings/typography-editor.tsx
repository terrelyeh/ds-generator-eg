"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORTED_LOCALES } from "@/lib/datasheet/locales";
import {
  TYPOGRAPHY_FIELDS,
  WEIGHT_OPTIONS,
  TYPOGRAPHY_DEFAULTS,
  FONT_OPTIONS,
  TYPOGRAPHY_GROUPS,
  parseGoogleFontUrl,
} from "@/lib/datasheet/typography";
import type { TypographySettings } from "@/lib/datasheet/typography";

interface FontOption {
  value: string;
  label: string;
  import: string;
}

export function TypographyEditor() {
  const localeOptions = SUPPORTED_LOCALES.filter((l) => l.value !== "en");
  const [locale, setLocale] = useState<string>(localeOptions[0]?.value ?? "ja");
  const [settings, setSettings] = useState<TypographySettings | null>(null);
  const [defaults, setDefaults] = useState<TypographySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);

  // Custom fonts
  const [customFonts, setCustomFonts] = useState<FontOption[]>([]);
  const [showAddFont, setShowAddFont] = useState(false);
  const [fontUrl, setFontUrl] = useState("");

  // Preview
  const [previewModel, setPreviewModel] = useState("ECC100");
  const [previewKey, setPreviewKey] = useState(0);
  const [previewScale, setPreviewScale] = useState(0.75);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [typoRes, fontsRes] = await Promise.all([
        fetch(`/api/settings/typography?locale=${locale}`),
        fetch(`/api/settings/fonts?locale=${locale}`),
      ]);
      const typoData = await typoRes.json();
      const fontsData = await fontsRes.json();

      if (typoData.ok) {
        setSettings(typoData.settings);
        setDefaults(typoData.defaults);
        setServerUpdatedAt(typoData.updated_at ?? null);
        setDirty(false);
      }
      if (fontsData.ok) {
        setCustomFonts(fontsData.fonts ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  function handleChange(key: keyof TypographySettings, value: string) {
    if (!settings) return;
    const isStringField = key === "text_color" || key === "font_family";
    const numVal = parseFloat(value);
    setSettings({ ...settings, [key]: isStringField ? value : (isNaN(numVal) ? 0 : numVal) });
    setDirty(true);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/typography", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, settings, expected_updated_at: serverUpdatedAt }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error(data.error || "Settings were modified by another user. Reloading...");
        fetchSettings();
        return;
      }
      if (data.ok) {
        toast.success("Typography settings saved");
        setServerUpdatedAt(data.updated_at ?? null);
        setDirty(false);
        setPreviewKey((k) => k + 1); // refresh preview
      } else {
        toast.error(`Save failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset to defaults? Your custom values will be lost.")) return;
    await fetch(`/api/settings/typography?locale=${locale}`, { method: "DELETE" });
    toast.success("Reset to defaults");
    fetchSettings();
    setPreviewKey((k) => k + 1);
  }

  async function handleAddFont() {
    const parsed = parseGoogleFontUrl(fontUrl);
    if (!parsed) {
      toast.error("Invalid Google Fonts URL. Use a URL like: https://fonts.google.com/specimen/Noto+Sans+JP");
      return;
    }
    // Check duplicate
    const allFonts = [...(FONT_OPTIONS[locale] ?? []), ...customFonts];
    if (allFonts.some((f) => f.value === parsed.value)) {
      toast.error(`"${parsed.value}" already exists`);
      return;
    }
    const updated = [...customFonts, parsed];
    setCustomFonts(updated);
    await fetch("/api/settings/fonts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, fonts: updated }),
    });
    setFontUrl("");
    setShowAddFont(false);
    toast.success(`Added "${parsed.label}"`);
  }

  async function handleRemoveFont(fontValue: string) {
    if (!confirm(`Remove "${fontValue}"?`)) return;
    const updated = customFonts.filter((f) => f.value !== fontValue);
    setCustomFonts(updated);
    await fetch("/api/settings/fonts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, fonts: updated }),
    });
    // If the removed font was selected, switch to default
    if (settings?.font_family === fontValue) {
      const defaultFont = defaults?.font_family ?? "Roboto";
      handleChange("font_family", defaultFont);
    }
    toast.success("Font removed");
  }

  function handleLocaleChange(newLocale: string) {
    if (dirty && !confirm("Unsaved changes. Switch anyway?")) return;
    setLocale(newLocale);
  }

  const isModified = (key: keyof TypographySettings) => {
    if (!settings || !defaults) return false;
    return settings[key] !== defaults[key];
  };

  const allFonts = [...(FONT_OPTIONS[locale] ?? []), ...customFonts];
  const localeInfo = SUPPORTED_LOCALES.find((l) => l.value === locale);

  // Load all candidate fonts so previews render correctly
  useEffect(() => {
    const fonts = [...(FONT_OPTIONS[locale] ?? []), ...customFonts];
    if (fonts.length === 0) return;
    const families = fonts.map((f) => `family=${f.import}:wght@400;500;700`).join("&");
    const linkId = `typography-font-preview-${locale}`;
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    return () => { link?.remove(); };
  }, [locale, customFonts]);

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-1.5 text-sm mb-4">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium text-foreground">Typography</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight">Typography Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adjust fonts, sizes, and weights per language. Save then preview to see changes.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
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

          {/* Preview model selector */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Preview:</label>
            <input
              type="text"
              value={previewModel}
              onChange={(e) => setPreviewModel(e.target.value.toUpperCase())}
              className="w-24 rounded-md border border-input bg-background px-2 py-1 text-xs"
              placeholder="ECC100"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : settings ? (
        /* ===== Split Layout: Left Settings + Right Preview ===== */
        <div className="flex gap-6" style={{ minHeight: "800px" }}>
          {/* Left: Settings */}
          <div className="w-[420px] flex-shrink-0 space-y-5">
            {/* Font Family */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Font Family</CardTitle>
                  {settings.font_family !== defaults?.font_family && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Modified</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {allFonts.map((font) => {
                    const isCustom = customFonts.some((f) => f.value === font.value);
                    return (
                      <div key={font.value} className="relative group">
                        <button
                          onClick={() => handleChange("font_family", font.value)}
                          className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all ${
                            settings.font_family === font.value
                              ? "border-engenius-blue bg-engenius-blue/5 ring-1 ring-engenius-blue"
                              : "border-border hover:border-engenius-blue/30"
                          }`}
                        >
                          <span className="text-[10px] font-medium text-muted-foreground">{font.label}</span>
                          <p className="mt-1 text-sm leading-snug" style={{ fontFamily: `'${font.value}', sans-serif`, fontWeight: 500 }}>
                            {locale === "ja" ? "クラウド管理型 AI ドームカメラ" : "雲端管理型 AI 戶外半球攝影機"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: `'${font.value}', sans-serif` }}>
                            {locale === "ja" ? "256GB 内蔵ストレージ搭載" : "內建 256GB 儲存空間"}
                          </p>
                        </button>
                        {isCustom && (
                          <button
                            onClick={() => handleRemoveFont(font.value)}
                            className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] shadow-sm"
                            title="Remove"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add custom font */}
                {showAddFont ? (
                  <div className="rounded-lg border border-dashed border-engenius-blue/30 p-3 space-y-2">
                    <input
                      type="text"
                      value={fontUrl}
                      onChange={(e) => setFontUrl(e.target.value)}
                      placeholder="Paste Google Fonts URL..."
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                      autoFocus
                    />
                    <p className="text-[10px] text-muted-foreground/60">
                      e.g. https://fonts.google.com/specimen/Noto+Sans+JP
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddFont} disabled={!fontUrl.trim()} className="text-xs h-7">
                        Add
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setShowAddFont(false); setFontUrl(""); }} className="text-xs h-7">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddFont(true)}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/20 py-2 text-xs font-medium text-muted-foreground hover:border-engenius-blue/30 hover:text-engenius-blue transition-colors"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                    Add Google Font
                  </button>
                )}
              </CardContent>
            </Card>

            {/* Typography properties grouped */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{localeInfo?.flag} Size & Weight</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {TYPOGRAPHY_GROUPS.map((group, gi) => (
                  <div key={group.label}>
                    {gi > 0 && <div className="border-t-2 border-foreground/8" />}
                    <div className="px-5 pt-3 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">{group.label}</span>
                    </div>
                    {group.fields.map((fieldKey) => {
                      const field = TYPOGRAPHY_FIELDS.find((f) => f.key === fieldKey);
                      if (!field) return null;
                      const value = settings[field.key];
                      const defaultVal = defaults?.[field.key];
                      const modified = isModified(field.key);

                      return (
                        <div key={field.key} className="flex items-center justify-between px-5 py-2">
                          <span className="text-xs font-medium w-[40%]">{field.label}</span>
                          <div className="flex items-center gap-2">
                            {field.type === "weight" ? (
                              <select
                                value={value as number}
                                onChange={(e) => handleChange(field.key, e.target.value)}
                                className="rounded border border-input bg-background px-1.5 py-1 text-xs w-20"
                              >
                                {WEIGHT_OPTIONS.map((w) => (
                                  <option key={w} value={w}>{w}</option>
                                ))}
                              </select>
                            ) : field.type === "color" ? (
                              <div className="flex items-center gap-1.5">
                                <input type="color" value={value as string} onChange={(e) => handleChange(field.key, e.target.value)} className="h-6 w-6 rounded border cursor-pointer" />
                                <input type="text" value={value as string} onChange={(e) => handleChange(field.key, e.target.value)} className="rounded border border-input bg-background px-1.5 py-1 text-xs w-20 font-mono" />
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={value as number}
                                  onChange={(e) => handleChange(field.key, e.target.value)}
                                  step={field.key.includes("letter") ? 0.1 : 0.5}
                                  min={0}
                                  className="rounded border border-input bg-background px-1.5 py-1 text-xs w-16 tabular-nums"
                                />
                                {field.unit && <span className="text-[10px] text-muted-foreground">{field.unit}</span>}
                              </div>
                            )}
                            <span className="text-[10px] tabular-nums text-muted-foreground/40 w-12 text-right">
                              {typeof defaultVal === "number" ? `${defaultVal}${field.unit}` : ""}
                            </span>
                            {modified && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Modified" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="h-3" />
              </CardContent>
            </Card>
          </div>

          {/* Right: Live Preview */}
          <div className="flex-1 min-w-0">
            <div className="sticky top-16">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground">Preview</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewScale((s) => Math.max(0.3, s - 0.1))}
                    className="flex h-6 w-6 items-center justify-center rounded border border-input text-xs text-muted-foreground hover:bg-muted transition-colors"
                    title="Zoom out"
                  >
                    −
                  </button>
                  <span className="text-xs tabular-nums text-muted-foreground w-10 text-center">
                    {Math.round(previewScale * 100)}%
                  </span>
                  <button
                    onClick={() => setPreviewScale((s) => Math.min(1.5, s + 0.1))}
                    className="flex h-6 w-6 items-center justify-center rounded border border-input text-xs text-muted-foreground hover:bg-muted transition-colors"
                    title="Zoom in"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="rounded-lg border bg-white shadow-sm overflow-hidden" style={{ height: "calc(100vh - 200px)" }}>
                <iframe
                  key={previewKey}
                  src={`/preview/${previewModel}?lang=${locale}&mode=light&toolbar=false&t=${previewKey}`}
                  className="w-full h-full border-0"
                  style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    width: `${100 / previewScale}%`,
                    height: `${100 / previewScale}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
