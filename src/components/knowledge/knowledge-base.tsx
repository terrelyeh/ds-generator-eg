"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TaxonomyPicker,
  TaxonomyBadges,
  EMPTY_TAXONOMY_VALUE,
  GLOBAL_SOLUTION_SLUG,
  type TaxonomyValue,
} from "./taxonomy-picker";

interface SourceItem {
  source_type: string;
  source_id: string;
  title: string;
  chunks: number;
  total_tokens: number;
  last_updated: string;
  product_line?: string | null;
  space_label?: string | null;
  space_url?: string | null;
  doc_label?: string | null;
  tab_name?: string | null;
  // Unified taxonomy
  solution?: string | null;
  product_lines?: string[];
  models?: string[];
}

interface SourceTypeStats {
  count: number;
  sources: number;
  total_tokens: number;
  last_updated: string | null;
}

interface SourceTypeConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
  status: "active" | "planned";
  canIngest: boolean;
}

const SOURCE_TYPES: SourceTypeConfig[] = [
  { id: "product_spec", label: "Product Specs", icon: "📦", description: "Product overview, features, and technical specifications from the database", status: "active", canIngest: true },
  { id: "gitbook", label: "Gitbook Docs", icon: "📖", description: "Technical documentation from Gitbook pages", status: "active", canIngest: true },
  { id: "helpcenter", label: "Help Center", icon: "💡", description: "Technical articles from Intercom Help Center — best practices, feature guides", status: "active", canIngest: true },
  { id: "google_doc", label: "Google Docs", icon: "📄", description: "Message guides, product briefs, marketing docs from Google Drive", status: "active", canIngest: true },
  { id: "wifi_regulation", label: "WiFi Regulations", icon: "📡", description: "Per-country WiFi regulation data (bands, channels, power, DFS) from RegHub — applies across all wireless products", status: "active", canIngest: true },
  { id: "web", label: "Web Pages", icon: "🌐", description: "Website content, product pages, landing pages", status: "planned", canIngest: false },
  { id: "text_snippet", label: "Text Snippets", icon: "📝", description: "Manual text entries — FAQ, competitive analysis, standard answers", status: "planned", canIngest: false },
  { id: "file", label: "Files (PDF/Word)", icon: "📎", description: "Uploaded PDF and Word documents", status: "planned", canIngest: false },
];

const SUMMARY_CARDS = [
  { key: "types", label: "Source Types", sub: "已啟用的內容來源類別" },
  { key: "sources", label: "Sources", sub: "已索引的產品 / 文件數量" },
  { key: "tokens", label: "Tokens", sub: "文字總量" },
  { key: "last_indexed", label: "Last Indexed", sub: "最後一次索引時間" },
];

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatTokens(tokens: number) {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

/** Known Gitbook spaces — easily add more here */
const GITBOOK_SPACES: { url: string; label: string }[] = [
  { url: "https://doc.engenius.ai/cloud-licensing", label: "Cloud Licensing" },
  { url: "https://doc.engenius.ai/home-cloud-user-manual", label: "Cloud User Manual" },
];

export function KnowledgeBase() {
  const [stats, setStats] = useState<Record<string, SourceTypeStats>>({});
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showGitbookDialog, setShowGitbookDialog] = useState(false);
  const [gitbookUrl, setGitbookUrl] = useState("");
  const [gitbookLabel, setGitbookLabel] = useState("");
  const [gitbookVision, setGitbookVision] = useState(true);
  const [gitbookIngesting, setGitbookIngesting] = useState(false);
  const [newArticleUrl, setNewArticleUrl] = useState("");
  const [showGoogleDocDialog, setShowGoogleDocDialog] = useState(false);
  const [googleDocUrl, setGoogleDocUrl] = useState("");
  const [googleDocLabel, setGoogleDocLabel] = useState("");
  const [googleDocIngesting, setGoogleDocIngesting] = useState(false);
  const [googleDocTaxonomy, setGoogleDocTaxonomy] = useState<TaxonomyValue>(EMPTY_TAXONOMY_VALUE);
  const [editTaxonomyTarget, setEditTaxonomyTarget] = useState<SourceItem | null>(null);
  const [editTaxonomyValue, setEditTaxonomyValue] = useState<TaxonomyValue>(EMPTY_TAXONOMY_VALUE);
  const [editTaxonomySaving, setEditTaxonomySaving] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats ?? {});
        setSources(data.sources ?? []);
        setTotal(data.total ?? 0);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleIngest(sourceType: string, force = false) {
    setIngesting(sourceType);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ingest", source_type: sourceType, force }),
      });
      const data = await res.json();
      if (data.ok) {
        const errors = data.errors?.length ? ` (${data.errors.length} errors)` : "";
        toast.success(`Indexed ${data.processed} chunks, ${data.skipped} unchanged${errors}`);
        fetchData();
      } else {
        toast.error(`Ingestion failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Ingestion failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIngesting(null);
    }
  }

  async function handleDelete(sourceType: string, sourceId?: string) {
    const target = sourceId ? `"${sourceId}"` : `all ${sourceType} documents`;
    if (!confirm(`Delete ${target}? This will remove the indexed data from the vector database.`)) return;
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: sourceType, source_id: sourceId }),
      });
      const data = await res.json();
      if (data.ok) { toast.success("Deleted"); fetchData(); }
    } catch { toast.error("Delete failed"); }
  }

  async function handleGitbookIngest(spaceUrl: string, spaceLabel: string, enableVision: boolean, force = false) {
    setGitbookIngesting(true);
    setIngesting("gitbook");
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ingest",
          source_type: "gitbook",
          space_url: spaceUrl,
          space_label: spaceLabel,
          enable_vision: enableVision,
          force,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const parts = [
          `${data.processed} chunks indexed`,
          `${data.skipped} unchanged`,
          `${data.pages_fetched} pages fetched`,
          data.pages_skipped > 0 ? `${data.pages_skipped} empty pages skipped` : null,
          data.images_described > 0 ? `${data.images_described} images described` : null,
        ].filter(Boolean);
        const errMsg = data.errors?.length ? ` (${data.errors.length} errors)` : "";
        toast.success(`${spaceLabel}: ${parts.join(", ")}${errMsg}`);
        if (data.errors?.length) {
          console.warn("Gitbook ingestion errors:", data.errors);
        }
        fetchData();
        setShowGitbookDialog(false);
        setGitbookUrl("");
        setGitbookLabel("");
      } else {
        toast.error(`Ingestion failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Ingestion failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGitbookIngesting(false);
      setIngesting(null);
    }
  }

  async function handleHelpcenterIngest(force = false) {
    setIngesting("helpcenter");
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ingest",
          source_type: "helpcenter",
          collection_urls: [
            "https://helpcenter.engenius.ai/en/collections/10870912-industry-vertical-best-practice",
            "https://helpcenter.engenius.ai/en/collections/10870934-engenius-help-center-documents",
          ],
          label: "EnGenius Help Center",
          force,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const parts = [
          `${data.processed} chunks indexed`,
          `${data.skipped} unchanged`,
          `${data.articles_fetched} articles fetched`,
        ].filter(Boolean);
        const errMsg = data.errors?.length ? ` (${data.errors.length} errors)` : "";
        toast.success(`Help Center: ${parts.join(", ")}${errMsg}`);
        fetchData();
      } else {
        toast.error(`Ingestion failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Ingestion failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIngesting(null);
    }
  }

  async function handleAddArticle() {
    if (!newArticleUrl.trim()) return;
    setIngesting("helpcenter");
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ingest",
          source_type: "helpcenter",
          article_urls: [newArticleUrl.trim()],
          label: "EnGenius Help Center",
        }),
      });
      const data = await res.json();
      if (data.ok && data.processed > 0) {
        toast.success(`Article indexed: ${data.processed} chunks`);
        setNewArticleUrl("");
        fetchData();
      } else if (data.ok && data.processed === 0) {
        toast.error("No content found — check the URL");
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIngesting(null);
    }
  }

  /** Convert UI TaxonomyValue → API payload (handles Global sentinel) */
  function taxonomyToPayload(v: TaxonomyValue) {
    return {
      solution: v.solution === GLOBAL_SOLUTION_SLUG ? null : v.solution,
      product_lines: v.product_lines,
      models: v.models,
    };
  }

  async function handleGoogleDocIngest() {
    if (!googleDocUrl.trim()) return;
    if (!googleDocTaxonomy.solution) {
      toast.error("Please select a Solution");
      return;
    }
    setGoogleDocIngesting(true);
    setIngesting("google_doc");
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ingest",
          source_type: "google_doc",
          doc_url: googleDocUrl.trim(),
          label: googleDocLabel.trim() || undefined,
          force: false,
          taxonomy: taxonomyToPayload(googleDocTaxonomy),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Google Doc: ${data.processed} chunks indexed, ${data.tabs_found} tabs found`);
        fetchData();
        setShowGoogleDocDialog(false);
        setGoogleDocUrl("");
        setGoogleDocLabel("");
        setGoogleDocTaxonomy(EMPTY_TAXONOMY_VALUE);
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGoogleDocIngesting(false);
      setIngesting(null);
    }
  }

  /** Re-fetch and re-index a single Google Doc source (per-row Sync). */
  async function handleGoogleDocSync(source: SourceItem) {
    // Extract doc_id from source_id format "docId/tabSlug"
    const docId = source.source_id.split("/")[0];
    setSyncingSourceId(source.source_id);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ingest",
          source_type: "google_doc",
          doc_url: `https://docs.google.com/document/d/${docId}`,
          label: source.doc_label || undefined,
          force: false,
          taxonomy: {
            solution: source.solution ?? null,
            product_lines: source.product_lines ?? [],
            models: source.models ?? [],
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Synced: ${data.processed} updated, ${data.skipped} unchanged`);
        fetchData();
      } else {
        toast.error(`Sync failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncingSourceId(null);
    }
  }

  /** Open the Edit Taxonomy dialog for a given source */
  function openEditTaxonomy(source: SourceItem) {
    setEditTaxonomyTarget(source);
    setEditTaxonomyValue({
      solution: source.solution ?? null,
      product_lines: source.product_lines ?? [],
      models: source.models ?? [],
    });
  }

  /** Save taxonomy edits via PATCH /api/documents */
  async function handleSaveTaxonomy() {
    if (!editTaxonomyTarget) return;
    setEditTaxonomySaving(true);
    try {
      const res = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: editTaxonomyTarget.source_type,
          source_id: editTaxonomyTarget.source_id,
          taxonomy: taxonomyToPayload(editTaxonomyValue),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Updated taxonomy on ${data.updated} chunk${data.updated === 1 ? "" : "s"}`);
        fetchData();
        setEditTaxonomyTarget(null);
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEditTaxonomySaving(false);
    }
  }

  const totalSources = Object.values(stats).reduce((s, v) => s + v.sources, 0);
  const totalTokens = Object.values(stats).reduce((s, v) => s + v.total_tokens, 0);
  const activeTypes = Object.keys(stats).length;
  const lastIndexed = Object.values(stats).reduce((latest, v) =>
    v.last_updated && (!latest || v.last_updated > latest) ? v.last_updated : latest, null as string | null);

  const summaryValues: Record<string, string> = {
    types: `${activeTypes}`,
    sources: `${totalSources}`,
    tokens: formatTokens(totalTokens),
    last_indexed: lastIndexed ? formatDate(lastIndexed) : "—",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage indexed content for Ask SpecHub.
          </p>
        </div>
        <button
          onClick={() => setShowInfo(true)}
          className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="How it works"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Info modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowInfo(false)}>
          <div className="bg-background rounded-xl shadow-xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">How Knowledge Base Works</h2>
              <button onClick={() => setShowInfo(false)} className="rounded-md p-1 hover:bg-muted transition-colors">
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p><strong className="text-foreground">1. Indexing</strong> — Content is split into small chunks and converted to mathematical vectors (embeddings) via OpenAI API.</p>
              <p><strong className="text-foreground">2. Storage</strong> — Vectors are stored in Supabase pgvector, enabling semantic similarity search.</p>
              <p><strong className="text-foreground">3. Search</strong> — When someone asks a question on the Ask page, the question is also converted to a vector, and the most similar chunks are retrieved.</p>
              <p><strong className="text-foreground">4. Answer</strong> — Retrieved chunks are sent to the AI model as context, which generates an accurate answer based only on your data.</p>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">Currently supports Product Specs and Gitbook Docs (with AI image descriptions). More source types (Google Docs, PDF, etc.) coming soon.</p>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards — reordered: types first */}
      <div className="grid grid-cols-4 gap-4">
        {SUMMARY_CARDS.map((card) => (
          <Card key={card.key} className="shadow-sm">
            <CardContent className="pt-4 pb-4 px-5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</div>
              <div className={`font-bold tabular-nums mt-1 ${card.key === "last_indexed" ? "text-lg" : "text-3xl"}`}>
                {summaryValues[card.key]}
              </div>
              <div className="text-xs text-muted-foreground/60 mt-1">{card.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-4">
          {SOURCE_TYPES.map((config) => {
            const typeStat = stats[config.id];
            const typeSources = sources.filter((s) => s.source_type === config.id);
            const isExpanded = expandedType === config.id;
            const isIngesting = ingesting === config.id;

            return (
              <Card key={config.id} className={`shadow-sm ${config.status === "planned" && !typeStat ? "opacity-60" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{config.icon}</span>
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          {config.label}
                          {typeStat ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {config.id === "gitbook"
                                ? `${new Set(typeSources.map((s) => s.space_label || "Unknown")).size} space${new Set(typeSources.map((s) => s.space_label || "Unknown")).size > 1 ? "s" : ""}`
                                : config.id === "helpcenter"
                                ? `${typeStat.sources} articles`
                                : `${typeStat.sources} sources`
                              } · {typeStat.count} chunks · {formatTokens(typeStat.total_tokens)} tokens
                            </span>
                          ) : config.status === "planned" ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Coming Soon</span>
                          ) : null}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {config.description}
                          {typeStat?.last_updated && (
                            <span className="ml-2 text-muted-foreground">
                              — Last indexed: {formatDate(typeStat.last_updated)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {typeStat && (
                        <Button variant="outline" size="sm" onClick={() => setExpandedType(isExpanded ? null : config.id)} className="text-xs">
                          {isExpanded ? "Hide" : "Details"}
                        </Button>
                      )}
                      {config.canIngest && config.id === "gitbook" && (
                        <Button size="sm" onClick={() => setShowGitbookDialog(true)} disabled={!!ingesting} className="text-xs">
                          {isIngesting ? "Indexing..." : "Add Space"}
                        </Button>
                      )}
                      {config.canIngest && config.id === "helpcenter" && (
                        <Button size="sm" onClick={() => handleHelpcenterIngest()} disabled={!!ingesting} className="text-xs">
                          {isIngesting ? "Indexing..." : typeStat ? "Re-index" : "Index"}
                        </Button>
                      )}
                      {config.canIngest && config.id === "google_doc" && (
                        <Button size="sm" onClick={() => setShowGoogleDocDialog(true)} disabled={!!ingesting} className="text-xs">
                          {isIngesting ? "Indexing..." : "Add Doc"}
                        </Button>
                      )}
                      {config.canIngest && config.id !== "gitbook" && config.id !== "helpcenter" && config.id !== "google_doc" && (
                        <Button size="sm" onClick={() => handleIngest(config.id)} disabled={!!ingesting} className="text-xs">
                          {isIngesting ? "Indexing..." : typeStat ? "Re-index" : "Index"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Expanded details — Gitbook shows space-level summary table */}
                {isExpanded && typeSources.length > 0 && config.id === "gitbook" && (
                  <CardContent className="pt-0">
                    {(() => {
                      // Group by space_label
                      const spaceMap = new Map<string, { pages: number; chunks: number; tokens: number; lastUpdated: string; url: string }>();
                      for (const s of typeSources) {
                        const label = s.space_label || "Unknown";
                        const existing = spaceMap.get(label) || { pages: 0, chunks: 0, tokens: 0, lastUpdated: "", url: s.space_url || "" };
                        existing.pages++;
                        existing.chunks += s.chunks;
                        existing.tokens += s.total_tokens;
                        if (s.last_updated > existing.lastUpdated) existing.lastUpdated = s.last_updated;
                        if (!existing.url && s.space_url) existing.url = s.space_url;
                        spaceMap.set(label, existing);
                      }
                      const spaces = [...spaceMap.entries()];
                      return (
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50">
                                <th className="text-left px-3 py-2 font-medium">Space</th>
                                <th className="text-center px-3 py-2 font-medium">Pages</th>
                                <th className="text-center px-3 py-2 font-medium">Chunks</th>
                                <th className="text-center px-3 py-2 font-medium">Tokens</th>
                                <th className="text-left px-3 py-2 font-medium">Last Updated</th>
                                <th className="text-right px-3 py-2 font-medium">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {spaces.map(([label, info]) => (
                                <tr key={label} className="border-t hover:bg-muted/30 transition-colors">
                                  <td className="px-3 py-2 font-medium">{label}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{info.pages}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{info.chunks}</td>
                                  <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{formatTokens(info.tokens)}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{formatDate(info.lastUpdated)}</td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="flex items-center justify-end gap-3">
                                      <button
                                        onClick={() => {
                                          if (!info.url) { toast.error("Space URL not found"); return; }
                                          handleGitbookIngest(info.url, label, gitbookVision);
                                        }}
                                        disabled={gitbookIngesting}
                                        className="text-xs text-muted-foreground/50 hover:text-engenius-blue transition-colors disabled:opacity-30"
                                      >
                                        {gitbookIngesting ? "Syncing..." : "Sync"}
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (!confirm(`Delete all "${label}" pages from the index?`)) return;
                                          const toDelete = typeSources.filter((s) => (s.space_label || "Unknown") === label);
                                          Promise.all(toDelete.map((s) =>
                                            fetch("/api/documents", {
                                              method: "DELETE",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ source_type: "gitbook", source_id: s.source_id }),
                                            })
                                          )).then(() => { toast.success(`Deleted "${label}"`); fetchData(); });
                                        }}
                                        className="text-xs text-muted-foreground/50 hover:text-red-500 transition-colors"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </CardContent>
                )}

                {/* Expanded details — Help Center shows article list + add article */}
                {isExpanded && config.id === "helpcenter" && (
                  <CardContent className="pt-0">
                    {typeSources.length > 0 && (
                      <div className="rounded-lg border overflow-hidden mb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="text-left px-3 py-2 font-medium">Article</th>
                              <th className="text-center px-3 py-2 font-medium">Chunks</th>
                              <th className="text-center px-3 py-2 font-medium">Tokens</th>
                              <th className="text-right px-3 py-2 font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {typeSources.map((s) => (
                              <tr key={s.source_id} className="border-t hover:bg-muted/30 transition-colors">
                                <td className="px-3 py-2">
                                  <span className="font-medium">{s.title}</span>
                                </td>
                                <td className="px-3 py-2 text-center tabular-nums">{s.chunks}</td>
                                <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{formatTokens(s.total_tokens)}</td>
                                <td className="px-3 py-2 text-right">
                                  <button onClick={() => handleDelete("helpcenter", s.source_id)}
                                    className="text-xs text-muted-foreground/50 hover:text-red-500 transition-colors">Delete</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Add Article + Re-index All */}
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={newArticleUrl}
                        onChange={(e) => setNewArticleUrl(e.target.value)}
                        placeholder="https://helpcenter.engenius.ai/en/articles/..."
                        className="flex-1 rounded-md border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
                        disabled={!!ingesting}
                        onKeyDown={(e) => e.key === "Enter" && handleAddArticle()}
                      />
                      <Button size="sm" onClick={handleAddArticle} disabled={!newArticleUrl.trim() || !!ingesting} className="text-xs">
                        {ingesting === "helpcenter" ? "Adding..." : "Add Article"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleHelpcenterIngest(true)}
                        disabled={!!ingesting}
                        className="text-xs"
                        title="Re-fetch and re-index all help center articles"
                      >
                        {ingesting === "helpcenter" ? "Re-indexing..." : "Re-index All"}
                      </Button>
                    </div>
                  </CardContent>
                )}

                {isExpanded && typeSources.length > 0 && config.id !== "gitbook" && config.id !== "helpcenter" && (
                  <CardContent className="pt-0">
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left px-3 py-2 font-medium">Source</th>
                            {config.id === "product_spec" && (
                              <th className="text-left px-3 py-2 font-medium">Product Line</th>
                            )}
                            <th className="text-left px-3 py-2 font-medium">Title</th>
                            <th className="text-center px-3 py-2 font-medium">Chunks</th>
                            <th className="text-center px-3 py-2 font-medium">Tokens</th>
                            <th className="text-left px-3 py-2 font-medium">Last Updated</th>
                            <th className="text-right px-3 py-2 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeSources.map((s) => {
                            const isGoogleDoc = s.source_type === "google_doc";
                            const sourceLabel = isGoogleDoc ? (s.tab_name || s.source_id) : s.source_id;
                            const titleLabel = isGoogleDoc ? (s.doc_label || s.title) : s.title;
                            const isSyncing = syncingSourceId === s.source_id;
                            return (
                            <tr key={`${s.source_type}:${s.source_id}`} className="border-t hover:bg-muted/30 transition-colors">
                              <td className={`px-3 py-2 font-medium text-engenius-blue max-w-[260px] truncate align-top ${isGoogleDoc ? "" : "font-mono"}`} title={s.source_id}>
                                <div className="truncate">{sourceLabel}</div>
                                <div className="mt-1">
                                  <TaxonomyBadges
                                    solution={s.solution ?? null}
                                    product_lines={s.product_lines ?? []}
                                    models={s.models ?? []}
                                  />
                                </div>
                              </td>
                              {config.id === "product_spec" && (
                                <td className="px-3 py-2 text-muted-foreground align-top">{s.product_line || "—"}</td>
                              )}
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[220px] align-top">{titleLabel}</td>
                              <td className="px-3 py-2 text-center tabular-nums align-top">{s.chunks}</td>
                              <td className="px-3 py-2 text-center tabular-nums text-muted-foreground align-top">{formatTokens(s.total_tokens)}</td>
                              <td className="px-3 py-2 text-muted-foreground align-top">{formatDate(s.last_updated)}</td>
                              <td className="px-3 py-2 text-right align-top">
                                <div className="flex items-center justify-end gap-2">
                                  {isGoogleDoc && (
                                    <button
                                      onClick={() => handleGoogleDocSync(s)}
                                      disabled={isSyncing}
                                      className="text-xs text-muted-foreground/60 hover:text-engenius-blue transition-colors disabled:opacity-40"
                                      title="Re-fetch from Drive and re-index"
                                    >
                                      {isSyncing ? "Syncing…" : "Sync"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => openEditTaxonomy(s)}
                                    className="text-xs text-muted-foreground/60 hover:text-engenius-blue transition-colors"
                                    title="Edit taxonomy tags"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDelete(s.source_type, s.source_id)}
                                    className="text-xs text-muted-foreground/50 hover:text-red-500 transition-colors"
                                    title={`Delete ${s.source_id} from index`}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground/50">
                        {typeSources.length} sources indexed
                      </p>
                      <div className="flex items-center gap-2">
                        {config.id === "product_spec" && (
                          <Button variant="outline" size="sm" onClick={() => handleIngest(config.id, true)} disabled={!!ingesting} className="text-xs">
                            {isIngesting ? "Indexing..." : "Force Re-index All"}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => handleDelete(config.id)} className="text-xs text-red-500 hover:text-red-700">
                          Delete All
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Gitbook Add Space Dialog */}
      {showGitbookDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !gitbookIngesting && setShowGitbookDialog(false)}>
          <div className="bg-background rounded-xl shadow-xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Index Gitbook Space</h2>
              <button
                onClick={() => !gitbookIngesting && setShowGitbookDialog(false)}
                className="rounded-md p-1 hover:bg-muted transition-colors"
                disabled={gitbookIngesting}
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>

            {/* Quick select from known spaces */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">Quick Select</label>
              <div className="flex flex-wrap gap-2">
                {GITBOOK_SPACES.map((space) => (
                  <button
                    key={space.url}
                    onClick={() => { setGitbookUrl(space.url); setGitbookLabel(space.label); }}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      gitbookUrl === space.url
                        ? "border-engenius-blue bg-engenius-blue/10 text-engenius-blue"
                        : "hover:border-engenius-blue/50 hover:bg-muted"
                    }`}
                  >
                    {space.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Manual URL input */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Space URL</label>
                <input
                  type="url"
                  value={gitbookUrl}
                  onChange={(e) => setGitbookUrl(e.target.value)}
                  placeholder="https://doc.engenius.ai/cloud-licensing"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
                  disabled={gitbookIngesting}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Label</label>
                <input
                  type="text"
                  value={gitbookLabel}
                  onChange={(e) => setGitbookLabel(e.target.value)}
                  placeholder="Cloud Licensing"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
                  disabled={gitbookIngesting}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="gitbook-vision"
                  checked={gitbookVision}
                  onChange={(e) => setGitbookVision(e.target.checked)}
                  className="rounded border"
                  disabled={gitbookIngesting}
                />
                <label htmlFor="gitbook-vision" className="text-xs text-muted-foreground">
                  Describe images with AI Vision (uses Gemini API credits)
                </label>
              </div>
            </div>

            {gitbookIngesting && (
              <div className="mt-4 rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <svg className="h-4 w-4 animate-spin text-engenius-blue" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Fetching pages, describing images, and generating embeddings...</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">This may take a few minutes for large spaces.</p>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGitbookDialog(false)}
                disabled={gitbookIngesting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleGitbookIngest(gitbookUrl, gitbookLabel, gitbookVision)}
                disabled={!gitbookUrl || !gitbookLabel || gitbookIngesting}
                className="text-xs"
              >
                {gitbookIngesting ? "Indexing..." : "Start Indexing"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Google Doc Dialog */}
      {showGoogleDocDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !googleDocIngesting && setShowGoogleDocDialog(false)}>
          <div className="bg-background rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Index Google Doc</h2>
              <button onClick={() => !googleDocIngesting && setShowGoogleDocDialog(false)} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={googleDocIngesting}>
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Google Doc URL <span className="text-red-500">*</span></label>
                <input type="url" value={googleDocUrl} onChange={(e) => setGoogleDocUrl(e.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
                  disabled={googleDocIngesting} />
                <p className="mt-1 text-[11px] text-muted-foreground/50">Doc must be shared with &quot;Anyone with the link&quot; or with the service account</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Label (optional)</label>
                <input type="text" value={googleDocLabel} onChange={(e) => setGoogleDocLabel(e.target.value)}
                  placeholder="e.g., AI Surveillance Message Guide"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-engenius-blue/50"
                  disabled={googleDocIngesting} />
              </div>

              <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3">
                <p className="text-xs font-medium mb-2">Taxonomy — where does this doc belong?</p>
                <TaxonomyPicker
                  value={googleDocTaxonomy}
                  onChange={setGoogleDocTaxonomy}
                  allowGlobal
                  required
                  disabled={googleDocIngesting}
                />
              </div>
            </div>

            {googleDocIngesting && (
              <div className="mt-4 rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-4 w-4 rounded-full border-2 border-engenius-blue/30 border-t-engenius-blue animate-spin" />
                  <span>Fetching document and generating embeddings...</span>
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowGoogleDocDialog(false)} disabled={googleDocIngesting} className="text-xs">Cancel</Button>
              <Button size="sm" onClick={handleGoogleDocIngest} disabled={!googleDocUrl.trim() || !googleDocTaxonomy.solution || googleDocIngesting} className="text-xs">
                {googleDocIngesting ? "Indexing..." : "Start Indexing"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Taxonomy Dialog */}
      {editTaxonomyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !editTaxonomySaving && setEditTaxonomyTarget(null)}>
          <div className="bg-background rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Edit Taxonomy</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">{editTaxonomyTarget.tab_name || editTaxonomyTarget.source_id}</p>
              </div>
              <button onClick={() => !editTaxonomySaving && setEditTaxonomyTarget(null)} className="rounded-md p-1 hover:bg-muted transition-colors" disabled={editTaxonomySaving}>
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>

            <TaxonomyPicker
              value={editTaxonomyValue}
              onChange={setEditTaxonomyValue}
              allowGlobal
              required
              disabled={editTaxonomySaving}
            />

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditTaxonomyTarget(null)} disabled={editTaxonomySaving} className="text-xs">Cancel</Button>
              <Button size="sm" onClick={handleSaveTaxonomy} disabled={editTaxonomySaving} className="text-xs">
                {editTaxonomySaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
