"use client";

import Link from "next/link";

const SETTINGS_SECTIONS = [
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
];

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure AI translation, glossary, and typography for multi-language datasheets.
        </p>
      </div>

      <div className="grid gap-4">
        {SETTINGS_SECTIONS.map((section) => (
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
