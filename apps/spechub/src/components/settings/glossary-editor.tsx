"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORTED_LOCALES } from "@/lib/datasheet/locales";

interface GlossaryEntry {
  id: string;
  english_term: string;
  locale: string;
  translated_term: string;
  scope: string;
  source: string;
  notes: string | null;
  updated_at: string;
}

const SCOPE_OPTIONS = [
  { value: "global", label: "🌐 Global" },
  { value: "Cloud Camera", label: "📷 Cloud Camera" },
  { value: "Cloud AP", label: "📡 Cloud AP" },
  { value: "Cloud Switch", label: "🔌 Cloud Switch" },
  { value: "Cloud AI-NVS", label: "💾 Cloud NVS" },
  { value: "Cloud VPN Firewall", label: "🔒 Cloud VPN FW" },
];

export function GlossaryEditor() {
  const localeOptions = SUPPORTED_LOCALES.filter((l) => l.value !== "en");

  const [locale, setLocale] = useState(localeOptions[0]?.value ?? "ja");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newEnglish, setNewEnglish] = useState("");
  const [newTranslated, setNewTranslated] = useState("");
  const [newScope, setNewScope] = useState("global");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTranslated, setEditTranslated] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const fetchGlossary = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ locale });
      if (scopeFilter !== "all") params.set("scope", scopeFilter);
      const res = await fetch(`/api/glossary?${params}`);
      const data = await res.json();
      if (data.ok) setGlossary(data.glossary);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [locale, scopeFilter]);

  useEffect(() => {
    fetchGlossary();
  }, [fetchGlossary]);

  async function handleAdd() {
    if (!newEnglish.trim() || !newTranslated.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          english_term: newEnglish,
          locale,
          translated_term: newTranslated,
          scope: newScope,
          notes: newNotes || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Term added");
        setNewEnglish("");
        setNewTranslated("");
        setNewNotes("");
        setShowAdd(false);
        fetchGlossary();
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(entry: GlossaryEntry) {
    setSaving(true);
    try {
      const res = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          english_term: entry.english_term,
          locale: entry.locale,
          translated_term: editTranslated,
          scope: entry.scope,
          notes: editNotes || null,
          expected_updated_at: entry.updated_at,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error(data.error || "This term was modified by another user. Reloading...");
        fetchGlossary();
        setEditingId(null);
        return;
      }
      if (data.ok) {
        toast.success("Term updated");
        setEditingId(null);
        fetchGlossary();
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this term?")) return;
    try {
      const res = await fetch("/api/glossary", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Term deleted");
        fetchGlossary();
      }
    } catch {
      toast.error("Delete failed");
    }
  }

  const filtered = glossary.filter((g) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      g.english_term.toLowerCase().includes(s) ||
      g.translated_term.toLowerCase().includes(s)
    );
  });

  const currentLocale = localeOptions.find((l) => l.value === locale)!;

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-1.5 text-sm mb-4">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
            Settings
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium text-foreground">Translation Glossary</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight">Translation Glossary</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage translation terms. AI will automatically use these terms when translating.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {localeOptions.map((l) => (
              <button
                key={l.value}
                onClick={() => setLocale(l.value)}
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

          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          >
            <option value="all">All Scopes</option>
            {SCOPE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search terms..."
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {filtered.length} terms
          </span>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            + Add Term
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="shadow-sm border-engenius-blue/30">
          <CardHeader>
            <CardTitle className="text-base">Add New Term</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">English Term</label>
                <input
                  type="text"
                  value={newEnglish}
                  onChange={(e) => setNewEnglish(e.target.value)}
                  placeholder="e.g. Night Vision"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {currentLocale.flag} {currentLocale.label}
                </label>
                <input
                  type="text"
                  value={newTranslated}
                  onChange={(e) => setNewTranslated(e.target.value)}
                  placeholder="Translated term"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Scope</label>
                <select
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {SCOPE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes (optional)</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Why this translation?"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving || !newEnglish.trim() || !newTranslated.trim()}>
                {saving ? "Adding..." : "Add"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Glossary table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {search ? "No matching terms" : "No terms in glossary yet. Add your first term above."}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-foreground/10">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground w-[30%]">English</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground w-[30%]">
                    {currentLocale.flag} {currentLocale.label}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground w-[15%]">Scope</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground w-[15%]">Notes</th>
                  <th className="px-4 py-3 w-[10%]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, idx) => {
                  const isEditing = editingId === entry.id;
                  const scopeLabel = SCOPE_OPTIONS.find((s) => s.value === entry.scope)?.label ?? entry.scope;

                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-border/50 hover:bg-engenius-blue/[0.03] ${
                        idx % 2 === 1 ? "bg-muted/30" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 text-sm font-medium">{entry.english_term}</td>
                      <td className="px-4 py-2.5 text-sm">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editTranslated}
                            onChange={(e) => setEditTranslated(e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                            autoFocus
                          />
                        ) : (
                          entry.translated_term
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">{scopeLabel}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Notes"
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/30"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground/60">{entry.notes || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => handleUpdate(entry)}
                              disabled={saving}
                              className="rounded px-2 py-1 text-xs font-medium text-engenius-blue hover:bg-engenius-blue/10 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => {
                                setEditingId(entry.id);
                                setEditTranslated(entry.translated_term);
                                setEditNotes(entry.notes ?? "");
                              }}
                              className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
