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
    key: "openrouter_api_key",
    label: "OpenRouter — 主要金鑰",
    description:
      "所有 chat completions 的統一入口：Datasheet 翻譯、Battlecard 競品抽取。一把 key 通所有廠商，換模型只要改字串。設定後即取代下方三家的直連路徑。",
    placeholder: "sk-or-v1-...",
    docsUrl: "https://openrouter.ai/settings/keys",
  },
  {
    key: "openrouter_api_key_ask",
    label: "OpenRouter — EnGenie Ask 專用（選填）",
    description:
      "只給 Ask 用的獨立 key：問答、部門 workspace、embed widget、Demo。留空就沿用上面那把主要金鑰。分開的好處是花費看得出是誰燒的，而且 Ask 對外暴露面較大（公開 workspace / widget），萬一外洩可單獨撤銷、不影響 datasheet 產出；也可以在 OpenRouter 後台單獨給它設消費上限。注意 workspace 若設為 BYOK，該 workspace 會用自己的 key，不走這把。",
    placeholder: "sk-or-v1-...",
    docsUrl: "https://openrouter.ai/settings/keys",
  },
  {
    key: "anthropic_api_key",
    label: "Anthropic (Claude) — 舊路徑",
    description:
      "OpenRouter 未設定時的翻譯備援。⚠️ 目前系統中並不存在這把 key，所以任何硬性要求它的功能（Battlecard ↻sync / 🔍web）在 OpenRouter 設定前都無法運作。",
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    key: "openai_api_key",
    label: "OpenAI — Embedding 必需，請勿刪除",
    description:
      "RAG 索引與搜尋的 Embedding（text-embedding-3-small, 1536 維）只走這把 key —— OpenRouter 不提供 embedding，且更換 embedding 模型等同整個知識庫重建索引。即使全面改用 OpenRouter，這把仍必須保留。",
    placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    key: "google_ai_api_key",
    label: "Google AI (Gemini) — 舊路徑",
    description: "OpenRouter 未設定時的翻譯備援；PDF 抽取與圖片理解目前仍直連這把 key。",
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

export function ApiKeysEditor() {
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
      const expected_updated_at: Record<string, string> = {};
      if (keyState.updated_at) {
        expected_updated_at[key] = keyState.updated_at;
      }

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: [{ key, value: keyState.value }],
          expected_updated_at,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error(data.error || "This key was modified by another user. Reloading...");
        window.location.reload();
        return;
      }
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
        <nav className="flex items-center gap-1.5 text-base mb-4">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium text-foreground">API Keys</span>
        </nav>
        <h1 className="text-[28px] font-bold tracking-tight">AI API Keys</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Manage API keys for AI translation, Ask SpecHub (RAG), and embedding. Keys are stored securely in the database.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">AI API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="py-8 text-center text-base text-muted-foreground">Loading...</div>
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
                      <h3 className="text-base font-semibold">{config.label}</h3>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                    </div>
                    {state.hasValue && !state.editing && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-medium text-emerald-700">
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
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-base font-mono shadow-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
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
                          className="ml-auto text-sm text-engenius-blue hover:underline"
                        >
                          Get API Key
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {state.hasValue ? (
                          <code className="block truncate rounded bg-muted px-2 py-1 text-sm font-mono text-muted-foreground">
                            {state.masked}
                          </code>
                        ) : (
                          <span className="text-sm text-muted-foreground/60">Not configured</span>
                        )}
                        {state.updated_at && (
                          <span className="mt-1 block text-sm text-muted-foreground/50">
                            Updated {formatDate(state.updated_at)}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(config.key)}
                        className="flex-shrink-0"
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

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800">
        <strong>Note:</strong> API keys stored here take priority over Vercel environment variables.
        If both exist, the key saved here will be used.
      </div>
    </div>
  );
}
