"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ApiKeyConfig {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  docsUrl: string;
}

const API_KEYS: ApiKeyConfig[] = [
  {
    key: "anthropic_api_key",
    label: "Anthropic (Claude)",
    description: "Used for Claude Sonnet and Claude Opus translation models.",
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    key: "openai_api_key",
    label: "OpenAI (GPT-4o)",
    description: "Used for GPT-4o translation model.",
    placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    key: "google_ai_api_key",
    label: "Google AI (Gemini)",
    description: "Used for Gemini 2.5 Pro translation model.",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
  },
];

interface KeyState {
  value: string;
  masked: string;
  hasValue: boolean;
  updated_at: string | null;
  editing: boolean;
}

export function SettingsPage() {
  const [keys, setKeys] = useState<Record<string, KeyState>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load existing key status on mount
  useEffect(() => {
    async function load() {
      try {
        const keyNames = API_KEYS.map((k) => k.key).join(",");
        const res = await fetch(`/api/settings?keys=${keyNames}`);
        const data = await res.json();
        if (data.ok) {
          const state: Record<string, KeyState> = {};
          for (const s of data.settings) {
            state[s.key] = {
              value: "",
              masked: s.masked,
              hasValue: s.hasValue,
              updated_at: s.updated_at,
              editing: false,
            };
          }
          setKeys(state);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleEdit(key: string) {
    setKeys((prev) => ({
      ...prev,
      [key]: { ...prev[key], editing: true, value: "" },
    }));
  }

  function handleCancel(key: string) {
    setKeys((prev) => ({
      ...prev,
      [key]: { ...prev[key], editing: false, value: "" },
    }));
  }

  function handleChange(key: string, value: string) {
    setKeys((prev) => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
  }

  async function handleSave(key: string) {
    const keyState = keys[key];
    if (!keyState?.value?.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: [{ key, value: keyState.value }],
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // Reload to get masked value
        const reloadRes = await fetch(`/api/settings?keys=${key}`);
        const reloadData = await reloadRes.json();
        const updated = reloadData.settings?.[0];
        setKeys((prev) => ({
          ...prev,
          [key]: {
            value: "",
            masked: updated?.masked ?? "",
            hasValue: true,
            updated_at: updated?.updated_at ?? new Date().toISOString(),
            editing: false,
          },
        }));
        toast.success("API Key saved");
      } else {
        toast.error(`Save failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage API keys for AI translation providers. Keys are stored securely in the database.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">AI Translation API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            API_KEYS.map((config) => {
              const state = keys[config.key] ?? {
                value: "",
                masked: "",
                hasValue: false,
                updated_at: null,
                editing: false,
              };

              return (
                <div
                  key={config.key}
                  className="rounded-lg border p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{config.label}</h3>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                    {state.hasValue && !state.editing && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Connected
                      </span>
                    )}
                  </div>

                  {state.editing ? (
                    <div className="space-y-2">
                      <input
                        type="password"
                        value={state.value}
                        onChange={(e) => handleChange(config.key, e.target.value)}
                        placeholder={config.placeholder}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSave(config.key)}
                          disabled={saving || !state.value.trim()}
                        >
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(config.key)}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                        <a
                          href={config.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto text-xs text-engenius-blue hover:underline"
                        >
                          Get API Key
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        {state.hasValue ? (
                          <code className="rounded bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
                            {state.masked}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">Not configured</span>
                        )}
                        {state.updated_at && (
                          <span className="ml-3 text-xs text-muted-foreground/50">
                            Updated {formatDate(state.updated_at)}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(config.key)}
                      >
                        {state.hasValue ? "Update" : "Add Key"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Glossary link */}
      <Card className="shadow-sm">
        <CardContent className="flex items-center justify-between py-5">
          <div>
            <h3 className="text-sm font-semibold">Translation Glossary</h3>
            <p className="text-xs text-muted-foreground">
              Manage company-approved translation terms. AI will follow these terms when translating.
            </p>
          </div>
          <Link href="/settings/glossary">
            <Button variant="outline" size="sm">
              Manage Glossary
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Note:</strong> API keys stored here take priority over Vercel environment variables.
        If both exist, the key saved here will be used.
      </div>
    </div>
  );
}
