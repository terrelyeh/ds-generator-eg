"use client";

import Link from "next/link";
import type { Role } from "@eg/auth/permissions";

interface SettingsSection {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  /** Which group the card belongs to on the Settings landing. */
  group: "ask" | "system";
  /** If set, only these roles see this card. Omitted = visible to everyone. */
  roles?: Role[];
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  // ── Ask / Knowledge ──────────────────────────────────────────────────────
  {
    title: "Ask Workspaces (Departments)",
    description: "Give each department its own /ask/<slug> chat — own passcode, LLM key (BYOK or shared+quota), knowledge scope, persona.",
    href: "/settings/ask-workspaces",
    group: "ask",
    roles: ["admin"],
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.84 8.84 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    title: "Ask Personas",
    description: "Manage AI personas for Ask — customize system prompts for different teams.",
    href: "/settings/personas",
    group: "ask",
    roles: ["admin"],
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
      </svg>
    ),
  },
  {
    title: "Ask Welcome",
    description: "Customize the greeting, description, and example questions shown in the Ask panel.",
    href: "/settings/ask-welcome",
    group: "ask",
    roles: ["admin"],
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    title: "API Access (Departments)",
    description: "Issue scoped API keys so other departments' apps can query the RAG knowledge base (Search API).",
    href: "/settings/api-access",
    group: "ask",
    roles: ["admin"],
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm3.293 2.293a1 1 0 011.414 0l2 2a1 1 0 010 1.414l-2 2a1 1 0 01-1.414-1.414L7.586 10 6.293 8.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h2a1 1 0 100-2h-2z" clipRule="evenodd" />
      </svg>
    ),
  },

  // ── System ───────────────────────────────────────────────────────────────
  {
    title: "AI Provider API Keys",
    description: "API keys for Claude, GPT, and Gemini — shared app_settings store; powers Ask answers, RAG embeddings, and SpecHub translation.",
    href: "/settings/api-keys",
    group: "system",
    roles: ["admin"],
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
];

const GROUPS: { key: "ask" | "system"; label: string }[] = [
  { key: "ask", label: "Ask / Knowledge" },
  { key: "system", label: "System" },
];

export function SettingsPage({ role }: { role: Role }) {
  const visible = SETTINGS_SECTIONS.filter((s) => !s.roles || s.roles.includes(role));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage Ask &amp; knowledge workspaces, external API access, and AI providers.
        </p>
      </div>

      {GROUPS.map((g) => {
        const items = visible.filter((s) => s.group === g.key);
        if (items.length === 0) return null;
        return (
          <div key={g.key} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              {g.label}
            </h2>
            <div className="grid gap-4">
              {items.map((section) => (
                <Link key={section.href} href={section.href}>
                  <div className="group flex items-center gap-4 rounded-lg border p-5 shadow-sm transition-all hover:border-engenius-blue/30 hover:shadow-md">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-engenius-blue/10 text-engenius-blue group-hover:bg-engenius-blue group-hover:text-white transition-colors">
                      {section.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold group-hover:text-engenius-blue transition-colors">
                        {section.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {section.description}
                      </p>
                    </div>
                    <svg className="h-4 w-4 flex-shrink-0 text-muted-foreground/30 group-hover:text-engenius-blue transition-colors" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
