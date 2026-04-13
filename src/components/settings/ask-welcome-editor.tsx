"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

interface WelcomeConfig {
  subtitle: string;
  description: string;
}

const DEFAULTS: WelcomeConfig = {
  subtitle: "",
  description: "",
};

export function AskWelcomeEditor() {
  const [config, setConfig] = useState<WelcomeConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/ask")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.welcome) {
          setConfig({
            subtitle: d.welcome.subtitle || "",
            description: d.welcome.description || "",
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      // Save both settings
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: [
            { key: "ask_welcome_subtitle", value: config.subtitle.trim() },
            { key: "ask_welcome_description", value: config.description.trim() },
          ],
        }),
      });
      if (!res.ok) throw new Error("Failed to save");

      toast.success("Welcome message saved");
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }

  const previewSubtitle = config.subtitle || getGreeting();
  const previewDescription = config.description || "I'm your EnGenius product specialist. Ask me about specs, configurations, licensing, or best practices.";

  if (!loaded) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3L5 8l5 5" /></svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ask Welcome</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Customize the greeting shown when users open the Ask panel.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editor */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm">Welcome Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Greeting / Subtitle
              </label>
              <input
                type="text"
                value={config.subtitle}
                onChange={(e) => setConfig((c) => ({ ...c, subtitle: e.target.value }))}
                placeholder={getGreeting()}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
              />
              <p className="mt-1 text-[11px] text-muted-foreground/50">
                Leave empty to use time-based greeting (Good morning / afternoon / evening)
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Description
              </label>
              <textarea
                value={config.description}
                onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))}
                placeholder="I'm your EnGenius product specialist. Ask me about specs, configurations, licensing, or best practices."
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/30 resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfig(DEFAULTS)}
                className="text-xs"
              >
                Reset to Default
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="text-xs"
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border bg-muted/20 p-8 flex flex-col items-center text-center">
              {/* Icon */}
              <div className="relative inline-flex items-center justify-center" style={{ width: 84, height: 84 }}>
                <div className="absolute inset-0 rounded-full bg-engenius-blue/6" />
                <div className="absolute inset-2 rounded-full bg-engenius-blue/4" />
                <svg width={56} height={56} viewBox="0 0 56 56" fill="none">
                  <path d="M28 8 L31 22 L45 25 L31 28 L28 42 L25 28 L11 25 L25 22 Z" fill="#03a9f4" opacity="0.85" />
                  <circle cx="28" cy="25" r="3" fill="white" opacity="0.9" />
                  <path d="M40 12 L41.2 15.8 L45 17 L41.2 18.2 L40 22 L38.8 18.2 L35 17 L38.8 15.8 Z" fill="#03a9f4" opacity="0.4" />
                  <path d="M14 36 L15 38.5 L17.5 39.5 L15 40.5 L14 43 L13 40.5 L10.5 39.5 L13 38.5 Z" fill="#03a9f4" opacity="0.3" />
                </svg>
              </div>

              {/* Text */}
              <h2 className="text-xl font-semibold mt-4 mb-1">{previewSubtitle}</h2>
              <p className="text-sm text-muted-foreground max-w-xs">{previewDescription}</p>

              {/* Fake example buttons */}
              <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-xs">
                <div className="rounded-lg border px-3 py-2 text-left text-xs text-muted-foreground/50">
                  哪些 AP 支援 WiFi 7？
                </div>
                <div className="rounded-lg border px-3 py-2 text-left text-xs text-muted-foreground/50">
                  怎麼設定 Site-to-Site VPN？
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
