"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  TaxonomyPicker,
  EMPTY_TAXONOMY_VALUE,
  GLOBAL_SOLUTION_SLUG,
  type TaxonomyValue,
} from "@/components/knowledge/taxonomy-picker";

interface Workspace {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  llm_mode: "shared" | "byok" | "user_byok";
  provider: string;
  byok_provider: string | null;
  scope: { solution?: string | null; product_lines?: string[]; models?: string[]; source_types?: string[] } | null;
  persona: string;
  profile: string;
  allow_switch: boolean;
  welcome_subtitle: string | null;
  welcome_description: string | null;
  example_questions: string[] | null;
  rate_limit_per_min: number;
  daily_limit: number | null;
  request_count: number;
  last_used_at: string | null;
  note: string | null;
  has_passcode: boolean;
  has_byok_key: boolean;
}

interface Opt { id: string; name?: string; label?: string }

const PROVIDERS = [
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (default)" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { id: "claude-sonnet", label: "Claude Sonnet" },
  { id: "claude-opus", label: "Claude Opus" },
  { id: "claude-haiku", label: "Claude Haiku" },
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
];
const SOURCE_TYPES = [
  { id: "product_spec", label: "Product Specs" },
  { id: "gitbook", label: "Gitbook" },
  { id: "helpcenter", label: "Help Center" },
  { id: "google_doc", label: "Google Docs" },
  { id: "wifi_regulation", label: "WiFi Regulations" },
  { id: "web", label: "Web Pages" },
  { id: "text_snippet", label: "Text Snippets" },
  { id: "file", label: "Files (PDF)" },
];

function familyOf(p: string) {
  return p.startsWith("claude") ? "Anthropic" : p.startsWith("gpt") ? "OpenAI" : "Google";
}

export function AskWorkspacesManager() {
  const [list, setList] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState<Opt[]>([]);
  const [profiles, setProfiles] = useState<Opt[]>([]);
  const [origin, setOrigin] = useState("");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // form
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [llmMode, setLlmMode] = useState<"shared" | "byok" | "user_byok">("shared");
  const [provider, setProvider] = useState("gemini-3.5-flash");
  const [byokKey, setByokKey] = useState("");
  const [tax, setTax] = useState<TaxonomyValue>(EMPTY_TAXONOMY_VALUE);
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [persona, setPersona] = useState("default");
  const [profile, setProfile] = useState("default");
  const [allowSwitch, setAllowSwitch] = useState(true);
  const [welcomeSubtitle, setWelcomeSubtitle] = useState("");
  const [welcomeDescription, setWelcomeDescription] = useState("");
  const [examples, setExamples] = useState("");
  const [rate, setRate] = useState(30);
  const [daily, setDaily] = useState("");
  const [editHasPasscode, setEditHasPasscode] = useState(false);
  const [editHasByok, setEditHasByok] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ask-workspaces");
      const d = await r.json();
      if (d.ok) setList(d.workspaces);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    fetch("/api/ask").then((r) => r.json()).then((d) => {
      if (d.ok) { setPersonas(d.personas ?? []); setProfiles(d.profiles ?? []); }
    }).catch(() => {});
  }, []);

  function resetForm() {
    setSlug(""); setName(""); setPasscode(""); setLlmMode("shared"); setProvider("gemini-3.5-flash");
    setByokKey(""); setTax(EMPTY_TAXONOMY_VALUE); setSourceTypes([]); setPersona("default"); setProfile("default");
    setAllowSwitch(true); setWelcomeSubtitle(""); setWelcomeDescription(""); setExamples(""); setRate(30); setDaily("");
    setEditId(null); setEditHasPasscode(false); setEditHasByok(false);
  }
  function openCreate() { resetForm(); setOpen(true); }
  function openEdit(w: Workspace) {
    setEditId(w.id); setSlug(w.slug); setName(w.name); setPasscode(""); setLlmMode(w.llm_mode);
    setProvider(w.provider); setByokKey("");
    setTax({ solution: w.scope?.solution ?? GLOBAL_SOLUTION_SLUG, product_lines: w.scope?.product_lines ?? [], models: w.scope?.models ?? [] });
    setSourceTypes(w.scope?.source_types ?? []);
    setPersona(w.persona); setProfile(w.profile); setAllowSwitch(w.allow_switch);
    setWelcomeSubtitle(w.welcome_subtitle ?? ""); setWelcomeDescription(w.welcome_description ?? "");
    setExamples((w.example_questions ?? []).join("\n")); setRate(w.rate_limit_per_min);
    setDaily(w.daily_limit != null ? String(w.daily_limit) : "");
    setEditHasPasscode(w.has_passcode); setEditHasByok(w.has_byok_key);
    setOpen(true);
  }

  async function save() {
    if (!name.trim()) { toast.error("Enter a name"); return; }
    if (!editId && !/^[a-z0-9-]+$/.test(slug)) { toast.error("Slug: lowercase letters, numbers, hyphens"); return; }
    // BYOK needs a key — either a newly entered one, or an existing saved one.
    if (llmMode === "byok" && !byokKey.trim() && !(editId && editHasByok)) {
      toast.error("BYOK 模式需要填入 API key");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: editId ?? undefined,
        slug: editId ? undefined : slug,
        name: name.trim(),
        passcode: passcode.trim() || undefined,
        llm_mode: llmMode,
        provider,
        byok_key: byokKey.trim() || undefined,
        scope: {
          solution: tax.solution === GLOBAL_SOLUTION_SLUG ? null : tax.solution,
          product_lines: tax.product_lines,
          models: tax.models,
          source_types: sourceTypes,
        },
        persona, profile, allow_switch: allowSwitch,
        welcome_subtitle: welcomeSubtitle,
        welcome_description: welcomeDescription,
        example_questions: examples.split("\n").map((s) => s.trim()).filter(Boolean),
        rate_limit_per_min: rate,
        daily_limit: daily.trim() ? Number(daily) : null,
      };
      const r = await fetch("/api/ask-workspaces", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.ok) { toast.error(`Failed: ${d.error}`); return; }
      toast.success(editId ? "Workspace updated" : "Workspace created");
      setOpen(false); resetForm(); fetchList();
    } catch (e) { toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setSaving(false); }
  }

  async function toggle(w: Workspace) {
    const r = await fetch("/api/ask-workspaces", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: w.id, enabled: !w.enabled }) });
    const d = await r.json();
    if (d.ok) { toast.success(w.enabled ? "Disabled" : "Enabled"); fetchList(); } else toast.error(d.error);
  }
  async function remove(w: Workspace) {
    if (!confirm(`Delete workspace "${w.name}" (/ask/${w.slug})? Its users lose access immediately.`)) return;
    const r = await fetch("/api/ask-workspaces", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: w.id }) });
    const d = await r.json();
    if (d.ok) { toast.success("Deleted"); fetchList(); } else toast.error(d.error);
  }

  return (
    <div>
      <nav className="flex items-center gap-1.5 text-sm mb-4">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-medium text-foreground">Ask Workspaces</span>
      </nav>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ask Workspaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Give a department its own <code className="rounded bg-muted px-1">/ask/&lt;slug&gt;</code> chat — own passcode,
            LLM key (BYOK or shared+quota), knowledge scope, and persona/welcome. Retrieval uses the shared KB, scoped.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="flex-shrink-0">+ New Workspace</Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No workspaces yet. Create one for a department.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Workspace</th>
                <th className="px-3 py-2 text-left font-medium">LLM</th>
                <th className="px-3 py-2 text-left font-medium">Scope</th>
                <th className="px-3 py-2 text-center font-medium">Limit</th>
                <th className="px-3 py-2 text-center font-medium">Reqs</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id} className="border-t align-top hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="font-medium text-engenius-dark">{w.name}</div>
                    <a href={`/ask/${w.slug}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-engenius-blue hover:underline">/ask/{w.slug} ↗</a>
                    {!w.has_passcode && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">no passcode</span>}
                    {!w.enabled && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">disabled</span>}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">
                    {w.llm_mode === "byok"
                      ? <span>BYOK · {familyOf(w.provider)}{!w.has_byok_key && <span className="text-red-600"> (key missing)</span>}</span>
                      : w.llm_mode === "user_byok"
                      ? <span>User BYOK · {familyOf(w.provider)}</span>
                      : "Shared key"}
                    <div className="text-muted-foreground/60">{w.provider}</div>
                  </td>
                  <td className="max-w-[200px] px-3 py-2 text-[11px] text-muted-foreground">
                    {w.scope?.solution || "All solutions"}{w.scope?.product_lines?.length ? ` · ${w.scope.product_lines.join(", ")}` : ""}
                    {w.scope?.source_types?.length ? ` · ${w.scope.source_types.length} src` : ""}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{w.rate_limit_per_min}/min{w.daily_limit ? ` · ${w.daily_limit}/d` : ""}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{w.request_count}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => { navigator.clipboard?.writeText(`${origin}/ask/${w.slug}`); toast.success("Entry URL copied"); }} className="text-engenius-blue hover:underline">Copy URL</button>
                      <button onClick={() => { navigator.clipboard?.writeText(`<script src="${origin}/widget.js" data-workspace="${w.slug}" data-title="${w.name.replace(/"/g, "&quot;")}" async></script>`); toast.success("Embed snippet copied — paste before </body>"); }} className="text-engenius-blue hover:underline" title="Copy a floating chat widget snippet for other sites">Embed</button>
                      <button onClick={() => openEdit(w)} className="text-engenius-blue hover:underline">Edit</button>
                      <button onClick={() => toggle(w)} className="text-muted-foreground hover:text-engenius-dark">{w.enabled ? "Disable" : "Enable"}</button>
                      <button onClick={() => remove(w)} className="text-muted-foreground/60 hover:text-red-500">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !saving && setOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-background p-6 shadow-xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editId ? "Edit Workspace" : "New Workspace"}</h2>
              <button onClick={() => !saving && setOpen(false)} disabled={saving} className="rounded-md p-1 hover:bg-muted">
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Slug (URL) {!editId && <span className="text-red-500">*</span>}</label>
                  <input value={slug} disabled={!!editId || saving} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="sales"
                    className="w-full rounded-md border px-3 py-2 font-mono text-sm disabled:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Name <span className="text-red-500">*</span></label>
                  <input value={name} disabled={saving} onChange={(e) => setName(e.target.value)} placeholder="Sales Team"
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Passcode {editId && editHasPasscode && <span className="font-normal text-muted-foreground/60">(leave blank to keep)</span>}</label>
                <input value={passcode} disabled={saving} onChange={(e) => setPasscode(e.target.value)} placeholder={editId && editHasPasscode ? "•••••• (unchanged)" : "set an access code"}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
              </div>

              <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
                <p className="mb-2 text-xs font-medium">LLM 生成模式</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {(["shared", "byok", "user_byok"] as const).map((m) => (
                    <button key={m} type="button" disabled={saving} onClick={() => setLlmMode(m)}
                      className={`rounded-md border px-3 py-1.5 text-xs ${llmMode === m ? "border-engenius-blue bg-engenius-blue/10 text-engenius-blue" : "hover:bg-muted"}`}>
                      {m === "shared" ? "Shared key + quota" : m === "byok" ? "Workspace BYOK (一把共用)" : "User BYOK (各自輸入)"}
                    </button>
                  ))}
                </div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Model</label>
                <select value={provider} disabled={saving} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
                  {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                {llmMode === "byok" && (
                  <div className="mt-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      BYOK API key（{familyOf(provider)}）{editId && editHasByok && <span className="font-normal text-muted-foreground/60">(leave blank to keep)</span>}
                    </label>
                    <input value={byokKey} disabled={saving} onChange={(e) => setByokKey(e.target.value)} placeholder={editId && editHasByok ? "•••••• (unchanged)" : `${familyOf(provider)} key`}
                      className="w-full rounded-md border px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
                    <p className="mt-1 text-[11px] text-muted-foreground/60">Key 須與所選模型同家族（Claude→Anthropic、GPT→OpenAI、Gemini→Google）。AES 加密儲存，整個 workspace 共用這一把。</p>
                  </div>
                )}
                {llmMode === "user_byok" && (
                  <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    每位使用者第一次進來時，會在前台輸入自己的 {familyOf(provider)} API key（存在他自己的瀏覽器，不進資料庫）。你只需選好模型，這裡不用填 key。
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
                <p className="mb-2 text-xs font-medium">知識範圍（共用 KB，scope 過濾）</p>
                <TaxonomyPicker value={tax} onChange={setTax} allowGlobal required={false} disabled={saving} />
                <p className="mb-1 mt-2 text-xs font-medium">來源類型 <span className="font-normal text-muted-foreground/60">(未選=全部)</span></p>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_TYPES.map((st) => (
                    <button key={st.id} type="button" disabled={saving} onClick={() => setSourceTypes((p) => p.includes(st.id) ? p.filter((x) => x !== st.id) : [...p, st.id])}
                      className={`rounded-md border px-2.5 py-1 text-xs ${sourceTypes.includes(st.id) ? "border-engenius-blue bg-engenius-blue/10 text-engenius-blue" : "hover:bg-muted"}`}>{st.label}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">預設 Persona</label>
                  <select value={persona} disabled={saving} onChange={(e) => setPersona(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
                    {(personas.length ? personas : [{ id: "default", name: "Default" }]).map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">預設對象 Profile</label>
                  <select value={profile} disabled={saving} onChange={(e) => setProfile(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
                    {(profiles.length ? profiles : [{ id: "default", label: "Default" }]).map((p) => <option key={p.id} value={p.id}>{p.label || p.id}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={allowSwitch} disabled={saving} onChange={(e) => setAllowSwitch(e.target.checked)} />
                允許使用者自行切換 模型 / 角色 / 對象（關閉則鎖定上面的預設）
              </label>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">歡迎標題</label>
                <input value={welcomeSubtitle} disabled={saving} onChange={(e) => setWelcomeSubtitle(e.target.value)} placeholder="How can I help you today?"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">歡迎說明</label>
                <input value={welcomeDescription} disabled={saving} onChange={(e) => setWelcomeDescription(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">範例問題（一行一個）</label>
                <textarea value={examples} disabled={saving} onChange={(e) => setExamples(e.target.value)} rows={3}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">每分鐘上限</label>
                  <input type="number" min={1} value={rate} disabled={saving} onChange={(e) => setRate(Number(e.target.value))} className="w-full rounded-md border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">每日上限 <span className="font-normal text-muted-foreground/60">(空=無限)</span></label>
                  <input type="number" min={1} value={daily} disabled={saving} onChange={(e) => setDaily(e.target.value)} placeholder="∞" className="w-full rounded-md border px-3 py-2 text-sm" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : editId ? "Save" : "Create"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
