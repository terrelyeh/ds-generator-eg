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
  {
    id: "product_spec",
    label: "Product Specs",
    icon: "📦",
    description: "Product overview, features, and technical specifications from the database",
    status: "active",
    canIngest: true,
  },
  {
    id: "text_snippet",
    label: "Text Snippets",
    icon: "📝",
    description: "Manual text entries — FAQ, competitive analysis, standard answers",
    status: "planned",
    canIngest: false,
  },
  {
    id: "gitbook",
    label: "Gitbook Docs",
    icon: "📖",
    description: "Technical documentation from Gitbook pages",
    status: "planned",
    canIngest: false,
  },
  {
    id: "google_doc",
    label: "Google Docs",
    icon: "📄",
    description: "Product briefs, marketing docs, internal documents from Google Drive",
    status: "planned",
    canIngest: false,
  },
  {
    id: "web",
    label: "Web Pages",
    icon: "🌐",
    description: "Website content, product pages, landing pages",
    status: "planned",
    canIngest: false,
  },
  {
    id: "file",
    label: "Files (PDF/Word)",
    icon: "📎",
    description: "Uploaded PDF and Word documents",
    status: "planned",
    canIngest: false,
  },
];

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
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
        if (data.errors?.length) {
          console.warn("Ingestion errors:", data.errors);
        }
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
      if (data.ok) {
        toast.success("Deleted successfully");
        fetchData();
      }
    } catch {
      toast.error("Delete failed");
    }
  }

  // Summary stats
  const totalSources = Object.values(stats).reduce((s, v) => s + v.sources, 0);
  const totalTokens = Object.values(stats).reduce((s, v) => s + v.total_tokens, 0);
  const activeTypes = Object.keys(stats).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage indexed content for Ask SpecHub. All content here is searchable via AI-powered vector search.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="text-2xl font-bold tabular-nums">{totalSources}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Sources</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="text-2xl font-bold tabular-nums">{total}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Chunks</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="text-2xl font-bold tabular-nums">{formatTokens(totalTokens)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Tokens</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="text-2xl font-bold tabular-nums">{activeTypes}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Source Types</div>
          </CardContent>
        </Card>
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {typeStat.sources} sources, {typeStat.count} chunks
                            </span>
                          ) : config.status === "planned" ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Coming Soon</span>
                          ) : null}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {typeStat && (
                        <>
                          <span className="text-xs text-muted-foreground/50 tabular-nums">
                            {formatTokens(typeStat.total_tokens)} tokens
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedType(isExpanded ? null : config.id)}
                            className="text-xs"
                          >
                            {isExpanded ? "Hide" : "Details"}
                          </Button>
                        </>
                      )}
                      {config.canIngest && (
                        <Button
                          size="sm"
                          onClick={() => handleIngest(config.id)}
                          disabled={isIngesting}
                          className="text-xs"
                        >
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
                            <th className="text-left px-3 py-2 font-medium">Title</th>
                            <th className="text-center px-3 py-2 font-medium">Chunks</th>
                            <th className="text-center px-3 py-2 font-medium">Tokens</th>
                            <th className="text-left px-3 py-2 font-medium">Last Updated</th>
                            <th className="text-right px-3 py-2 font-medium"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeSources.map((s) => (
                            <tr key={`${s.source_type}:${s.source_id}`} className="border-t hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2 font-mono font-medium text-engenius-blue">{s.source_id}</td>
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{s.title}</td>
                              <td className="px-3 py-2 text-center tabular-nums">{s.chunks}</td>
                              <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{formatTokens(s.total_tokens)}</td>
                              <td className="px-3 py-2 text-muted-foreground">{formatDate(s.last_updated)}</td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => handleDelete(s.source_type, s.source_id)}
                                  className="text-red-400 hover:text-red-600 transition-colors"
                                  title="Delete"
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M5 3V2a1 1 0 011-1h4a1 1 0 011 1v1M2.5 3.5h11M6 6.5v5M10 6.5v5M3.5 3.5l.5 9a1 1 0 001 1h6a1 1 0 001-1l.5-9" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground/50">
                        Last indexed: {formatDate(typeStat?.last_updated ?? null)}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleIngest(config.id, true)}
                          disabled={isIngesting}
                          className="text-xs"
                        >
                          {isIngesting ? "Indexing..." : "Force Re-index All"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(config.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
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

      {/* Info callout */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>How it works:</strong> Content is split into chunks, converted to vectors via OpenAI Embedding, and stored in pgvector for semantic search.
        When someone asks a question on the Ask page, the most relevant chunks are retrieved and sent to the AI for answering.
      </div>
    </div>
  );
}
