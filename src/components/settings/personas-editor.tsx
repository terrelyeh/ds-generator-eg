"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PersonaItem {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  icon?: string;
  is_default?: boolean;
  updated_at?: string;
}

export function PersonasEditor() {
  const [personas, setPersonas] = useState<PersonaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editIcon, setEditIcon] = useState("");

  // New persona form state
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newIcon, setNewIcon] = useState("🤖");

  async function fetchPersonas() {
    setLoading(true);
    try {
      const res = await fetch("/api/personas");
      const data = await res.json();
      if (data.ok) setPersonas(data.personas);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPersonas(); }, []);

  function startEdit(p: PersonaItem) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDescription(p.description);
    setEditPrompt(p.system_prompt);
    setEditIcon(p.icon ?? "🤖");
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: editName,
          description: editDescription,
          system_prompt: editPrompt,
          icon: editIcon,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Persona saved");
        setEditingId(null);
        fetchPersonas();
      } else {
        toast.error(`Save failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!newId || !newName || !newPrompt) return;
    setSaving(true);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newId,
          name: newName,
          description: newDescription,
          system_prompt: newPrompt,
          icon: newIcon,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Persona created");
        setShowAdd(false);
        setNewId("");
        setNewName("");
        setNewDescription("");
        setNewPrompt("");
        setNewIcon("🤖");
        fetchPersonas();
      } else {
        toast.error(`Create failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Create failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this persona? Built-in personas will revert to defaults.")) return;
    try {
      const res = await fetch("/api/personas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Persona deleted");
        fetchPersonas();
      }
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-1.5 text-sm mb-4">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium text-foreground">Ask Personas</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight">Ask Personas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize AI system prompts for different teams. Each persona defines how Ask SpecHub answers questions.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-4">
          {personas.map((p) => (
            <Card key={p.id} className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{p.icon || "🤖"}</span>
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        {p.name}
                        {p.is_default && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Built-in</span>
                        )}
                        {p.updated_at && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Customized</span>
                        )}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingId === p.id ? (
                      <>
                        <Button size="sm" onClick={() => handleSave(p.id)} disabled={saving}>
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)} disabled={saving}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => startEdit(p)}>
                          Edit
                        </Button>
                        {!p.is_default && (
                          <Button variant="outline" size="sm" onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-700">
                            Delete
                          </Button>
                        )}
                        {p.is_default && p.updated_at && (
                          <Button variant="outline" size="sm" onClick={() => handleDelete(p.id)} className="text-muted-foreground">
                            Reset
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>

              {editingId === p.id ? (
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-[80px_1fr] gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Icon</label>
                      <input
                        value={editIcon}
                        onChange={(e) => setEditIcon(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-center text-xl"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Name</label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">System Prompt</label>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={10}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed"
                    />
                  </div>
                </CardContent>
              ) : (
                <CardContent>
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                      View system prompt
                    </summary>
                    <pre className="mt-2 rounded-md bg-muted p-3 text-xs font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {p.system_prompt}
                    </pre>
                  </details>
                </CardContent>
              )}
            </Card>
          ))}

          {/* Add new persona */}
          {showAdd ? (
            <Card className="shadow-sm border-dashed border-engenius-blue/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">New Persona</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-[80px_1fr_1fr] gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Icon</label>
                    <input
                      value={newIcon}
                      onChange={(e) => setNewIcon(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-center text-xl"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">ID (slug)</label>
                    <input
                      value={newId}
                      onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="e.g. partner"
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Partner Portal"
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <input
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Short description of when to use this persona"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">System Prompt</label>
                  <textarea
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    rows={8}
                    placeholder="You are a..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleAdd} disabled={saving || !newId || !newName || !newPrompt}>
                    {saving ? "Creating..." : "Create Persona"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/20 py-4 text-sm font-medium text-muted-foreground hover:border-engenius-blue/30 hover:text-engenius-blue transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Add Custom Persona
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Tip:</strong> Each persona can be used via the Ask page or directly via API:
        <code className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-mono">POST /api/ask {"{"}&quot;persona&quot;: &quot;sales&quot;, ...{"}"}</code>
      </div>
    </div>
  );
}
