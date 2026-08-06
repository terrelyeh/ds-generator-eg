/**
 * OpenRouter account reads — spend, credits, per-model activity.
 *
 * Separate from openrouter.ts because these use a DIFFERENT credential.
 * Per the OpenAPI spec (openrouter.ai/openapi.json, read 2026-08-06):
 *
 *   GET /key       — normal inference key. Usage for THAT key only.
 *   GET /credits   — management key required. Account-wide balance.
 *   GET /activity  — management key required. 30 days by model/provider.
 *
 * So the account balance genuinely cannot be read with the inference key
 * the app already has. Rather than demand the stronger credential to show
 * anything, every read degrades independently: with just the inference
 * key you still get that key's daily/weekly/monthly burn, and adding a
 * management key unlocks the true balance and the model breakdown.
 *
 * The management key is deliberately NOT listed in the API Keys UI. It can
 * create and delete API keys and read billing, so the intended home is the
 * OPENROUTER_MANAGEMENT_KEY env var rather than a plaintext app_settings
 * row. getApiKey still checks the DB first, so a row works if someone
 * insists — this only shapes the default path.
 */
import { getApiKey } from "@eg/db/settings";
import { getOpenRouterKey } from "./openrouter";

const BASE = "https://openrouter.ai/api/v1";

export async function getManagementKey(): Promise<string | null> {
  return getApiKey("openrouter_management_key", "OPENROUTER_MANAGEMENT_KEY");
}

export interface KeyInfo {
  label: string;
  limit: number | null;
  limit_remaining: number | null;
  limit_reset: string | null;
  is_free_tier: boolean;
  usage: number;
  usage_daily: number;
  usage_weekly: number;
  usage_monthly: number;
  byok_usage: number;
}

export interface Credits {
  total_credits: number;
  total_usage: number;
}

export interface ActivityRow {
  date: string;
  model: string;
  model_permaslug: string;
  provider_name: string;
  endpoint_id: string;
  requests: number;
  usage: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
}

export interface UsageSnapshot {
  key: KeyInfo | null;
  credits: Credits | null;
  activity: ActivityRow[] | null;
  /** Human-readable reasons a section is missing, shown in the UI. */
  warnings: string[];
  managementKeyConfigured: boolean;
  fetchedAt: string;
}

async function get<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(`OpenRouter ${path}: ${body.error.message ?? JSON.stringify(body.error)}`);
  }
  return body.data as T;
}

// Spend figures move slowly and this sits behind an admin page that gets
// refreshed by hand; a short TTL keeps repeat views off OpenRouter's API
// without ever showing genuinely stale numbers.
let cache: { at: number; snapshot: UsageSnapshot } | null = null;
const TTL_MS = 5 * 60_000;

export function invalidateUsageCache(): void {
  cache = null;
}

export async function getUsageSnapshot(force = false): Promise<UsageSnapshot> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.snapshot;

  const [inferenceKey, managementKey] = await Promise.all([
    getOpenRouterKey(),
    getManagementKey(),
  ]);

  const warnings: string[] = [];

  // Independent so one failure never blanks the others.
  const [keyRes, creditsRes, activityRes] = await Promise.allSettled([
    inferenceKey
      ? get<KeyInfo>("/key", inferenceKey)
      : Promise.reject(new Error("no inference key")),
    managementKey
      ? get<Credits>("/credits", managementKey)
      : Promise.reject(new Error("no management key")),
    managementKey
      ? get<ActivityRow[]>("/activity", managementKey)
      : Promise.reject(new Error("no management key")),
  ]);

  if (!inferenceKey) {
    warnings.push("尚未設定 OpenRouter API key — 無法讀取這把 key 的用量。");
  } else if (keyRes.status === "rejected") {
    warnings.push(`讀取 key 用量失敗：${keyRes.reason?.message ?? keyRes.reason}`);
  }

  if (!managementKey) {
    warnings.push(
      "尚未設定 management key（OPENROUTER_MANAGEMENT_KEY）— 帳戶餘額與各模型花費需要它才能讀取。",
    );
  } else {
    if (creditsRes.status === "rejected") {
      warnings.push(`讀取帳戶餘額失敗：${creditsRes.reason?.message ?? creditsRes.reason}`);
    }
    if (activityRes.status === "rejected") {
      warnings.push(`讀取用量明細失敗：${activityRes.reason?.message ?? activityRes.reason}`);
    }
  }

  const snapshot: UsageSnapshot = {
    key: keyRes.status === "fulfilled" ? keyRes.value : null,
    credits: creditsRes.status === "fulfilled" ? creditsRes.value : null,
    activity: activityRes.status === "fulfilled" ? activityRes.value : null,
    warnings,
    managementKeyConfigured: !!managementKey,
    fetchedAt: new Date().toISOString(),
  };

  cache = { at: Date.now(), snapshot };
  return snapshot;
}
