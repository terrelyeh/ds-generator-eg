"use client";

import Link from "next/link";
import type { Role } from "@/lib/auth/permissions";

interface SettingsSection {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  /** If set, only these roles see this card. Omitted = visible to everyone. */
  roles?: Role[];
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    title: "AI Translation API Keys",
    description: "Manage API keys for Claude, GPT-4o, and Gemini translation providers.",
    href: "/settings/api-keys",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    title: "Translation Glossary",
    description: "Manage company-approved translation terms. AI will follow these terms when translating.",
    href: "/settings/glossary",
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
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    title: "Ask Welcome",
    description: "Customize the greeting, description, and example questions shown in the Ask panel.",
    href: "/settings/ask-welcome",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    title: "Ask Personas",
    description: "Manage AI personas for Ask SpecHub — customize system prompts for different teams.",
    href: "/settings/personas",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
      </svg>
    ),
  },
  {
    title: "Users",
    description: "Manage who can access Product SpecHub. Invite, change roles, remove members.",
    href: "/settings/users",
    roles: ["admin"],
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
      </svg>
    ),
  },
];

export function SettingsPage({ role }: { role: Role }) {
  const visible = SETTINGS_SECTIONS.filter(
    (s) => !s.roles || s.roles.includes(role)
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure AI translation, glossary, and typography for multi-language datasheets.
        </p>
      </div>

      <div className="grid gap-4">
        {visible.map((section) => (
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
}
