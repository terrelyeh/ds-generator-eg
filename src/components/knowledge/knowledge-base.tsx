"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SourceItem {
  source_type: string;
  source_id: string;
  title: string;
  chunks: number;
  total_tokens: number;
  last_updated: string;
  product_line?: string | null;
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
  { id: "text_snippet", label: "Text Snippets", icon: "📝", description: "Manual text entries — FAQ, competitive analysis, standard answers", status: "planned", canIngest: false },
  { id: "gitbook", label: "Gitbook Docs", icon: "📖", description: "Technical documentation from Gitbook pages", status: "planned", canIngest: false },
  { id: "google_doc", label: "Google Docs", icon: "📄", description: "Product briefs, marketing docs, internal documents from Google Drive", status: "planned", canIngest: false },
  { id: "web", label: "Web Pages", icon: "🌐", description: "Website content, product pages, landing pages", status: "planned", canIngest: false },
  { id: "file", label: "Files (PDF/Word)", icon: "📎", description: "Uploaded PDF and Word documents", status: "planned", canIngest: false },
];

const SUMMARY_CARDS = [
  { key: "types", label: "Source Types", sub: "已啟用的內容來源類別" },
  { key: "sources", label: "Sources", sub: "已索引的產品 / 文件數量" },
  { key: "chunks", label: "Chunks", sub: "切割後的搜尋片段" },
  { key: "tokens", label: "Tokens", sub: "文字總量" },
];

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatTokens(tokens: number) {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

export function KnowledgeBase() {
  const [stats, setStats] = useState<Record<string, SourceTypeStats>>({});
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

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

  const totalSources = Object.values(stats).reduce((s, v) => s + v.sources, 0);
  const totalTokens = Object.values(stats).reduce((s, v) => s + v.total_tokens, 0);
  const activeTypes = Object.keys(stats).length;

  const summaryValues: Record<string, string> = {
    types: `${activeTypes}`,
    sources: `${totalSources}`,
    chunks: `${total}`,
    tokens: formatTokens(totalTokens),
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
              <p className="text-xs text-muted-foreground">Currently supports Product Specs. More source types (Gitbook, Google Docs, PDF, etc.) coming soon.</p>
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
              <div className="text-3xl font-bold tabular-nums mt-1">{summaryValues[card.key]}</div>
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
                              {typeStat.sources} sources, {typeStat.count} chunks
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
                        <>
                          <span className="text-xs text-muted-foreground/50 tabular-nums">
                            {formatTokens(typeStat.total_tokens)} tokens
                          </span>
                          <Button variant="outline" size="sm" onClick={() => setExpandedType(isExpanded ? null : config.id)} className="text-xs">
                            {isExpanded ? "Hide" : "Details"}
                          </Button>
                        </>
                      )}
                      {config.canIngest && (
                        <Button size="sm" onClick={() => handleIngest(config.id)} disabled={isIngesting} className="text-xs">
                          {isIngesting ? "Indexing..." : typeStat ? "Re-index" : "Index"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Expanded details */}
                {isExpanded && typeSources.length > 0 && (
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
                          {typeSources.map((s) => (
                            <tr key={`${s.source_type}:${s.source_id}`} className="border-t hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2 font-mono font-medium text-engenius-blue">{s.source_id}</td>
                              {config.id === "product_spec" && (
                                <td className="px-3 py-2 text-muted-foreground">{s.product_line || "—"}</td>
                              )}
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{s.title}</td>
                              <td className="px-3 py-2 text-center tabular-nums">{s.chunks}</td>
                              <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{formatTokens(s.total_tokens)}</td>
                              <td className="px-3 py-2 text-muted-foreground">{formatDate(s.last_updated)}</td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => handleDelete(s.source_type, s.source_id)}
                                  className="text-xs text-muted-foreground/50 hover:text-red-500 transition-colors"
                                  title={`Delete ${s.source_id} from index`}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground/50">
                        {typeSources.length} sources indexed
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleIngest(config.id, true)} disabled={isIngesting} className="text-xs">
                          {isIngesting ? "Indexing..." : "Force Re-index All"}
                        </Button>
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
    </div>
  );
}
