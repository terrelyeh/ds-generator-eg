"use client";

import { useState, useEffect } from "react";
import { AVAILABLE_PROVIDERS } from "./types";

export type ProviderAvailability = Record<string, boolean>;

/**
 * Hook that fetches which AI providers have API keys configured.
 * Returns availability map + loading state.
 * Auto-selects the first available provider.
 */
export function useProviders() {
  const [availability, setAvailability] = useState<ProviderAvailability>({});
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState("claude-sonnet");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/providers");
        const data = await res.json();
        setAvailability(data);

        // Auto-select first available provider
        const firstAvailable = AVAILABLE_PROVIDERS.find((p) => data[p.id]);
        if (firstAvailable) {
          setSelectedProvider(firstAvailable.id);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const hasAnyProvider = Object.values(availability).some(Boolean);

  return {
    availability,
    loading,
    selectedProvider,
    setSelectedProvider,
    hasAnyProvider,
  };
}
