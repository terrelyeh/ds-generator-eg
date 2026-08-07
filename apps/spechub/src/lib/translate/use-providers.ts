"use client";

import { useState, useEffect } from "react";
import type { TranslateModel } from "./types";

/**
 * Models offered in the translation picker, from the DB catalog.
 *
 * Was a hardcoded list crossed with a per-vendor availability probe: with
 * three direct clients, "can I use this model" meant "is that vendor's key
 * set". One OpenRouter key reaches every model, so availability collapsed
 * to a single question the catalog answers by simply listing the row.
 *
 * Auto-selects the catalog's default (it sorts first among defaults).
 */
export function useProviders() {
  const [models, setModels] = useState<TranslateModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/models?surface=translate");
        const data = await res.json();
        if (!data.ok) return;

        const rows = (data.models ?? []) as (TranslateModel & { default_for?: string[] })[];
        setModels(rows);

        const preferred =
          rows.find((m) => m.default_for?.includes("translate")) ?? rows[0];
        if (preferred) setSelectedProvider(preferred.slug);
      } catch {
        // A failed catalog load leaves the picker empty rather than
        // pretending a model is available; the API surfaces the reason.
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return {
    models,
    loading,
    selectedProvider,
    setSelectedProvider,
    hasAnyProvider: models.length > 0,
  };
}
