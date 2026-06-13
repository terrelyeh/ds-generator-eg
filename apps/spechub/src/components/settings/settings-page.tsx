"use client";

import Link from "next/link";
import type { Role } from "@eg/auth/permissions";

// Ask/Knowledge + AI-provider settings moved to the EnGenie app
// (monorepo split). One card deep-links there for admins.
const ENGENIE_URL = (process.env.NEXT_PUBLIC_ENGENIE_URL ?? "").replace(/\/$/, "");

interface SettingsSection {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  /** Which group the card belongs to on the Settings landing. */
  group: "translation" | "system";
  /** If set, only these roles see this card. Omitted = visible to everyone. */
  roles?: Role[];
  /** External link (EnGenie app) — rendered with <a target="_blank">. */
  external?: boolean;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  // ── Translation / Datasheet ──────────────────────────────────────────────
  {
    title: "Translation Glossary",
    description: "Manage company-approved translation terms. AI will follow these terms when translating.",
    href: "/settings/glossary",
    group: "translation",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
      </svg>
    ),
  },
  {
    title: "Typography",
    description: "Adjust fonts, sizes, and weights per language for Datasheet PDF generation.",
    href: "/settings/typography",
    group: "translation",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    ),
  },

  // ── System ───────────────────────────────────────────────────────────────
  {
    title: "Users",
    description: "Manage who can access Product SpecHub. Invite, change roles, remove members.",
    href: "/settings/users",
    group: "system",
    roles: ["admin"],
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
      </svg>
    ),
  },
  ...(ENGENIE_URL
    ? [
        {
          title: "EnGenie Settings (Ask / Knowledge / AI Keys)",
          description:
            "Ask workspaces, personas, welcome, department API access, and AI provider keys now live on the EnGenie app.",
          href: `${ENGENIE_URL}/settings`,
          group: "system" as const,
          roles: ["admin" as const],
          external: true,
          icon: (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.84 8.84 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd" />
            </svg>
          ),
        },
      ]
    : []),
];

const GROUPS: { key: "translation" | "system"; label: string }[] = [
  { key: "translation", label: "Translation / Datasheet" },
  { key: "system", label: "System" },
];

export function SettingsPage({ role }: { role: Role }) {
  const visible = SETTINGS_SECTIONS.filter((s) => !s.roles || s.roles.includes(role));

  const card = (section: SettingsSection) => (
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
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage translation, typography, and access.
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
              {items.map((section) =>
                section.external ? (
                  <a
                    key={section.href}
                    href={section.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {card(section)}
                  </a>
                ) : (
                  <Link key={section.href} href={section.href}>
                    {card(section)}
                  </Link>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
