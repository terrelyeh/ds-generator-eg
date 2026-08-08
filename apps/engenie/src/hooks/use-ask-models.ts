"use client";

import { useState, useEffect } from "react";

export interface AskModel {
  slug: string;
  label: string;
  tier: string | null;
  default_for?: string[];
}

export interface AskModelGroup {
  /** Vendor name derived from the slug prefix — "Claude" / "GPT" / "Gemini". */
  label: string;
  models: AskModel[];
}

const VENDOR_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "GPT",
  google: "Gemini",
};

/**
 * Models offered in the Ask picker, from the DB catalog.
 *
 * Both chat surfaces used to carry their own hardcoded list. That's how
 * they survived the slug migration untouched, and why every selection
 * silently fell back to the surface default: they were sending retired
 * short ids ("claude-opus") that resolve to nothing in a slug-keyed
 * catalog. The picker looked like it worked and changed nothing.
 *
 * Grouping comes from the slug prefix rather than a stored field — the
 * slug already carries the vendor, and a second field would be one more
 * thing to keep in step.
 */
export function useAskModels() {
  const [groups, setGroups] = useState<AskModelGroup[]>([]);
  const [defaultSlug, setDefaultSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/models?surface=ask");
        const data = await res.json();
        if (!data.ok) return;

        const rows = (data.models ?? []) as AskModel[];

        // Preserve the catalog's sort_order within each vendor, and order
        // the vendors by where their first model appears.
        const byVendor = new Map<string, AskModel[]>();
        for (const m of rows) {
          const vendor = m.slug.split("/")[0] ?? "";
          const key = VENDOR_LABEL[vendor] ?? vendor;
          byVendor.set(key, [...(byVendor.get(key) ?? []), m]);
        }

        setGroups([...byVendor.entries()].map(([label, models]) => ({ label, models })));
        setDefaultSlug(
          rows.find((m) => m.default_for?.includes("ask"))?.slug ?? rows[0]?.slug ?? "",
        );
      } catch {
        // Leave the picker empty rather than offering a model the backend
        // won't accept.
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { groups, defaultSlug, loading };
}
