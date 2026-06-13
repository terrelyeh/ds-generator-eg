"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SolutionItem {
  id: string;
  slug: string;
  label: string;
  icon: string | null;
  color_primary: string;
  product_line_count: number;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  cloud: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  ),
  fit: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  broadband: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" />
    </svg>
  ),
  network: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="6" height="6" rx="1" /><rect x="16" y="2" width="6" height="6" rx="1" /><rect x="9" y="16" width="6" height="6" rx="1" /><path d="M5 8v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M12 12v4" />
    </svg>
  ),
  accessories: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v10M18.4 6.6l-4.2 4.2M22 12h-10M18.4 17.4l-4.2-4.2M12 22V12M5.6 17.4l4.2-4.2M2 12h10M5.6 6.6l4.2 4.2" />
    </svg>
  ),
  datacenter: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><circle cx="6" cy="6" r="1" /><circle cx="6" cy="18" r="1" />
    </svg>
  ),
  legacy: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

function getIcon(iconKey: string | null) {
  return ICON_MAP[iconKey ?? ""] ?? ICON_MAP["network"];
}

export function SolutionSidebar({
  solutions,
}: {
  solutions: SolutionItem[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);

  // Extract current solution slug from pathname: /dashboard/cloud → cloud
  const currentSlug = pathname.split("/")[2] ?? "";

  return (
    <aside
      className={`relative flex flex-col border-r bg-muted/30 transition-all duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent transition-colors"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg
          className={`h-3 w-3 text-muted-foreground transition-transform ${collapsed ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10 4 6 8l4 4" />
        </svg>
      </button>

      {/* Header */}
      <div className={`px-3 pt-5 pb-3 ${collapsed ? "px-2" : ""}`}>
        {!collapsed && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Solutions
          </span>
        )}
      </div>

      {/* Solution list */}
      <nav className="flex-1 space-y-0.5 px-2">
        {solutions.map((s) => {
          const isActive = s.slug === currentSlug;
          return (
            <Link
              key={s.id}
              href={`/dashboard/${s.slug}`}
              title={collapsed ? `${s.label} (${s.product_line_count})` : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-engenius-blue/10 text-engenius-blue"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <span
                className={`flex-shrink-0 ${isActive ? "text-engenius-blue" : ""}`}
              >
                {getIcon(s.icon)}
              </span>
              {!collapsed && (
                <>
                  <span className="truncate">{s.label}</span>
                  <span
                    className={`ml-auto text-[11px] tabular-nums ${
                      isActive
                        ? "text-engenius-blue/70"
                        : "text-muted-foreground/60"
                    }`}
                  >
                    {s.product_line_count}
                  </span>
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
