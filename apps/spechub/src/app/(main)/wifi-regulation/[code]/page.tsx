import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getApiKey, API_KEY_MAP } from "@/lib/settings";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

const API_BASE = "https://wifi-reghub.vercel.app/api/wifi-regs/v1";

async function fetchCountryMarkdown(code: string): Promise<{ markdown: string; name: string } | null> {
  const apiKey = await getApiKey("wifi_reghub_api_key", API_KEY_MAP.wifi_reghub_api_key);
  if (!apiKey) return null;

  try {
    const [mdRes, metaRes] = await Promise.all([
      fetch(`${API_BASE}/countries/${code}/text`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      }),
      fetch(`${API_BASE}/countries/${code}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      }),
    ]);

    if (!mdRes.ok || !metaRes.ok) return null;

    const markdown = await mdRes.text();
    const meta = (await metaRes.json()) as { name?: string };
    return { markdown, name: meta.name || code };
  } catch {
    return null;
  }
}

export default async function WifiRegulationPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) notFound();

  const data = await fetchCountryMarkdown(code);
  if (!data) notFound();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/knowledge"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 12L6 8l4-4" />
            </svg>
            Knowledge Base
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-engenius-blue/10 px-2.5 py-1 text-[11px] font-medium text-engenius-blue">
            <span>📡</span>
            <span>WiFi Regulation</span>
          </span>
        </div>

        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-engenius-dark dark:text-white">
            {data.name}
          </h1>
          <span className="font-mono text-sm text-muted-foreground">({code})</span>
        </div>

        <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h1:hidden prose-h2:mt-6 prose-h2:mb-2 prose-h2:text-base prose-h3:text-sm prose-h3:mt-4 prose-table:my-3 prose-table:text-xs prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.markdown}
          </ReactMarkdown>
        </article>

        <footer className="mt-10 border-t pt-4 text-[11px] text-muted-foreground/60">
          Source: EnGenius WiFi RegHub ·{" "}
          <a
            href="https://wifi-reghub.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors underline decoration-dotted"
          >
            wifi-reghub.vercel.app
          </a>
        </footer>
      </div>
    </div>
  );
}
