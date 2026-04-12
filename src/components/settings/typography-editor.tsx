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
} from "@/lib/datasheet/typography";
import type { TypographySettings } from "@/lib/datasheet/typography";

export function TypographyEditor() {
  const localeOptions = SUPPORTED_LOCALES.filter((l) => l.value !== "en");
  const [locale, setLocale] = useState<string>(localeOptions[0]?.value ?? "ja");
  const [settings, setSettings] = useState<TypographySettings | null>(null);
  const [defaults, setDefaults] = useState<TypographySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/typography?locale=${locale}`);
      const data = await res.json();
      if (data.ok) {
        setSettings(data.settings);
        setDefaults(data.defaults);
        setDirty(false);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function handleChange(key: keyof TypographySettings, value: string) {
    if (!settings) return;
    const isStringField = key === "text_color" || key === "font_family";
    const numVal = parseFloat(value);
    setSettings({
      ...settings,
      [key]: isStringField ? value : (isNaN(numVal) ? 0 : numVal),
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/typography", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, settings }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Typography settings saved");
        setDirty(false);
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
    try {
      await fetch(`/api/settings/typography?locale=${locale}`, { method: "DELETE" });
      toast.success("Reset to defaults");
      fetchSettings();
    } catch {
      toast.error("Reset failed");
    }
  }

  function handleLocaleChange(newLocale: string) {
    if (dirty && !confirm("Unsaved changes. Switch anyway?")) return;
    setLocale(newLocale);
  }

  const isModified = (key: keyof TypographySettings) => {
    if (!settings || !defaults) return false;
    return settings[key] !== defaults[key];
  };

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-1.5 text-sm mb-4">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
            Settings
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium text-foreground">Typography</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight">Typography Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adjust font sizes and weights for each language. Changes apply to Datasheet PDF preview and generation.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
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

        <div className="flex items-center gap-3">
          <Link
            href={`/preview/ECC100?lang=${locale}&mode=light`}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent transition-colors"
          >
            Preview ECC100
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 3h8v8M13 3 6 10" />
            </svg>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
          >
            Reset to Defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Settings */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : settings ? (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {SUPPORTED_LOCALES.find((l) => l.value === locale)?.flag}{" "}
              {SUPPORTED_LOCALES.find((l) => l.value === locale)?.label} Typography
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Font Family selector */}
            <div className="mb-6 rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold">Font Family</h3>
                  <p className="text-xs text-muted-foreground">
                    Default: {defaults?.font_family}
                    {settings.font_family !== defaults?.font_family && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Modified</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(FONT_OPTIONS[locale] ?? []).map((font) => (
                  <button
                    key={font.value}
                    onClick={() => { handleChange("font_family", font.value); }}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                      settings.font_family === font.value
                        ? "border-engenius-blue bg-engenius-blue/5 ring-1 ring-engenius-blue"
                        : "border-border hover:border-engenius-blue/30"
                    }`}
                  >
                    <span className="text-sm font-medium">{font.label}</span>
                    <p
                      className="mt-1 text-xs text-muted-foreground truncate"
                      style={{ fontFamily: `'${font.value}', sans-serif` }}
                    >
                      {locale === "ja" ? "クラウド管理型 AI ドームカメラ 256GB" : "雲端管理型 AI 戶外半球攝影機"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-foreground/10">
                  <th className="py-2 text-left text-xs font-semibold text-muted-foreground w-[35%]">Property</th>
                  <th className="py-2 text-left text-xs font-semibold text-muted-foreground w-[25%]">Value</th>
                  <th className="py-2 text-left text-xs font-semibold text-muted-foreground w-[20%]">Default</th>
                  <th className="py-2 w-[20%]"></th>
                </tr>
              </thead>
              <tbody>
                {TYPOGRAPHY_FIELDS.map((field) => {
                  const value = settings[field.key];
                  const defaultVal = defaults?.[field.key];
                  const modified = isModified(field.key);

                  return (
                    <tr key={field.key} className="border-b border-border/50">
                      <td className="py-3 text-sm font-medium">{field.label}</td>
                      <td className="py-3">
                        {field.type === "weight" ? (
                          <select
                            value={value as number}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm w-24"
                          >
                            {WEIGHT_OPTIONS.map((w) => (
                              <option key={w} value={w}>{w}</option>
                            ))}
                          </select>
                        ) : field.type === "color" ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={value as string}
                              onChange={(e) => handleChange(field.key, e.target.value)}
                              className="h-8 w-8 rounded border border-input cursor-pointer"
                            />
                            <input
                              type="text"
                              value={value as string}
                              onChange={(e) => handleChange(field.key, e.target.value)}
                              className="rounded-md border border-input bg-background px-2 py-1 text-sm w-24 font-mono"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={value as number}
                              onChange={(e) => handleChange(field.key, e.target.value)}
                              step={field.key.includes("letter") ? 0.1 : 0.5}
                              min={0}
                              className="rounded-md border border-input bg-background px-2 py-1 text-sm w-20 tabular-nums"
                            />
                            {field.unit && (
                              <span className="text-xs text-muted-foreground">{field.unit}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-xs tabular-nums text-muted-foreground">
                        {typeof defaultVal === "number" ? `${defaultVal}${field.unit}` : defaultVal}
                      </td>
                      <td className="py-3 text-right">
                        {modified && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            Modified
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Tip:</strong> Save your changes, then click <strong>Preview ECC100</strong> to see the effect immediately.
        Use <strong>Reset to Defaults</strong> to restore the original values.
      </div>
    </div>
  );
}
