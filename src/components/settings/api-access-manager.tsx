"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TaxonomyPicker,
  EMPTY_TAXONOMY_VALUE,
  GLOBAL_SOLUTION_SLUG,
  type TaxonomyValue,
} from "@/components/knowledge/taxonomy-picker";

interface ApiKeyScope {
  solution?: string | null;
  product_lines?: string[];
  models?: string[];
  source_types?: string[];
}

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scope: ApiKeyScope | null;
  rate_limit_per_min: number;
  enabled: boolean;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
  note: string | null;
  recoverable?: boolean;
}

const SOURCE_TYPE_OPTIONS = [
  { id: "product_spec", label: "Product Specs" },
  { id: "gitbook", label: "Gitbook" },
  { id: "helpcenter", label: "Help Center" },
  { id: "google_doc", label: "Google Docs" },
  { id: "wifi_regulation", label: "WiFi Regulations" },
  { id: "web", label: "Web Pages" },
];

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function scopeSummary(scope: ApiKeyScope | null): string {
  const s = scope || {};
  const parts: string[] = [];
  parts.push(s.solution ? `Solution: ${s.solution}` : "All solutions");
  if (s.product_lines?.length) parts.push(`Lines: ${s.product_lines.join(", ")}`);
  if (s.models?.length) parts.push(`Models: ${s.models.length}`);
  parts.push(s.source_types?.length ? `Sources: ${s.source_types.join(", ")}` : "All sources");
  return parts.join(" · ");
}

export function ApiAccessManager() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [rate, setRate] = useState(60);
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>(EMPTY_TAXONOMY_VALUE);
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);

  // freshly-created plaintext key (shown once)
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/api-keys");
      const data = await res.json();
      if (data.ok) setKeys(data.keys);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  function resetForm() {
    setName(""); setNote(""); setRate(60);
    setTaxonomy(EMPTY_TAXONOMY_VALUE); setSourceTypes([]);
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setShowDialog(true);
  }

  function openEdit(k: ApiKeyRow) {
    setEditId(k.id);
    setName(k.name);
    setNote(k.note || "");
    setRate(k.rate_limit_per_min);
    setTaxonomy({
      solution: k.scope?.solution ?? GLOBAL_SOLUTION_SLUG,
      product_lines: k.scope?.product_lines ?? [],
      models: k.scope?.models ?? [],
    });
    setSourceTypes(k.scope?.source_types ?? []);
    setShowDialog(true);
  }

  function scopePayload(): ApiKeyScope {
    return {
      solution: taxonomy.solution === GLOBAL_SOLUTION_SLUG ? null : taxonomy.solution,
      product_lines: taxonomy.product_lines,
      models: taxonomy.models,
      source_types: sourceTypes,
    };
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Enter a name (department / app)"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId ?? undefined,
          name: name.trim(),
          note: note.trim(),
          rate_limit_per_min: rate,
          scope: scopePayload(),
        }),
      });
      const data = await res.json();
      if (!data.ok) { toast.error(`Failed: ${data.error}`); return; }
      setShowDialog(false);
      if (!editId && data.key) {
        setNewKey(data.key); // reveal once
      } else {
        toast.success("API key updated");
      }
      resetForm();
      fetchKeys();
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(k: ApiKeyRow) {
    const res = await fetch("/api/api-keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: k.id, enabled: !k.enabled }),
    });
    const data = await res.json();
    if (data.ok) { toast.success(k.enabled ? "Key disabled" : "Key enabled"); fetchKeys(); }
    else toast.error(`Failed: ${data.error}`);
  }

  async function handleCopyKey(k: ApiKeyRow) {
    try {
      const res = await fetch(`/api/api-keys?reveal=${encodeURIComponent(k.id)}`);
      const data = await res.json();
      if (!data.ok || !data.key) { toast.error(data.error || "Could not retrieve key"); return; }
      await navigator.clipboard.writeText(data.key);
      setCopiedId(k.id);
      setTimeout(() => setCopiedId((c) => (c === k.id ? null : c)), 1800);
      toast.success("API key copied to clipboard");
    } catch (err) {
      toast.error(`Copy failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDelete(k: ApiKeyRow) {
    if (!confirm(`Permanently delete the key "${k.name}"? Apps using it will stop working immediately.`)) return;
    const res = await fetch("/api/api-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: k.id }),
    });
    const data = await res.json();
    if (data.ok) { toast.success("Key deleted"); fetchKeys(); }
    else toast.error(`Failed: ${data.error}`);
  }

  function toggleSourceType(id: string) {
    setSourceTypes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-engenius-dark">API Access (Departments)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Issue scoped API keys so other teams&apos; apps can query the RAG knowledge base via the
            Search API. Each key is limited to the Solution / Product Lines / source types you set here.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="flex-shrink-0">+ New Key</Button>
      </div>

      {/* Endpoint reference */}
      <Card className="mb-6 border-dashed shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How departments call it (server-to-server)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-[#0d1117] p-3 text-[12px] leading-relaxed text-slate-100">{`curl -X POST https://ds-generator-eg.vercel.app/api/v1/search \\
  -H "Authorization: Bearer sk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"Which APs support WiFi 7?","top_k":8}'

# Optional: narrow within the key's scope
#   "source_types": ["product_spec","helpcenter"]
#   "taxonomy": { "product_lines": ["Cloud AP"] }`}</pre>
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            Returns relevant chunks (content + source + score). The key never goes in client/browser code.
            Rate limited per key; scope is enforced server-side.
          </p>
        </CardContent>
      </Card>

      {/* Keys table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No API keys yet. Create one for a department to get started.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Key</th>
                <th className="px-3 py-2 text-left font-medium">Scope</th>
                <th className="px-3 py-2 text-center font-medium">Rate/min</th>
                <th className="px-3 py-2 text-center font-medium">Requests</th>
                <th className="px-3 py-2 text-left font-medium">Last used</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t align-top hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="font-medium text-engenius-dark">{k.name}</div>
                    {k.note && <div className="mt-0.5 text-[11px] text-muted-foreground">{k.note}</div>}
                    {!k.enabled && (
                      <span className="mt-1 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">disabled</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{k.key_prefix}…</td>
                  <td className="max-w-[280px] px-3 py-2 text-[11px] text-muted-foreground">{scopeSummary(k.scope)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{k.rate_limit_per_min}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{k.request_count}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(k.last_used_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {k.recoverable && (
                        <button onClick={() => handleCopyKey(k)} className="text-engenius-blue hover:underline" title="Copy the full API key">
                          {copiedId === k.id ? "Copied" : "Copy key"}
                        </button>
                      )}
                      <button onClick={() => openEdit(k)} className="text-engenius-blue hover:underline">Edit</button>
                      <button onClick={() => toggleEnabled(k)} className="text-muted-foreground hover:text-engenius-dark">
                        {k.enabled ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => handleDelete(k)} className="text-muted-foreground/60 hover:text-red-500">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !saving && setShowDialog(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-6 shadow-xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editId ? "Edit API Key" : "New API Key"}</h2>
              <button onClick={() => !saving && setShowDialog(false)} disabled={saving} className="rounded-md p-1 hover:bg-muted">
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Name (department / app) <span className="text-red-500">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Sales Portal, Marketing Chatbot"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" disabled={saving} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Rate limit (requests / minute)</label>
                <input type="number" min={1} max={6000} value={rate} onChange={(e) => setRate(Number(e.target.value))}
                  className="w-32 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" disabled={saving} />
              </div>

              <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
                <p className="mb-2 text-xs font-medium">Scope — Solution / Product Line / Model <span className="font-normal text-muted-foreground/60">(Global = all)</span></p>
                <TaxonomyPicker value={taxonomy} onChange={setTaxonomy} allowGlobal required={false} disabled={saving} />
              </div>

              <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
                <p className="mb-2 text-xs font-medium">Allowed source types <span className="font-normal text-muted-foreground/60">(none selected = all)</span></p>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_TYPE_OPTIONS.map((st) => (
                    <button key={st.id} type="button" onClick={() => toggleSourceType(st.id)} disabled={saving}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        sourceTypes.includes(st.id)
                          ? "border-engenius-blue bg-engenius-blue/10 text-engenius-blue"
                          : "hover:border-engenius-blue/50 hover:bg-muted"
                      }`}>
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Note (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contact / purpose"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50" disabled={saving} />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
                {saving ? "Saving…" : editId ? "Save" : "Create Key"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reveal-once dialog for a newly created key */}
      {newKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl mx-4">
            <h2 className="text-lg font-semibold">API key created</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Copy it and share with the department. You can also copy it again later via
              <strong> Copy key</strong> in the list. Keep it server-side only.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#0d1117] p-3">
              <code className="flex-1 break-all font-mono text-[12px] text-slate-100">{newKey}</code>
              <Button size="sm" variant="outline" onClick={async () => {
                try { await navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
              }}>{copied ? "Copied" : "Copy"}</Button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => setNewKey(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
