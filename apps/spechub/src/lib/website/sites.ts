/**
 * The five regional EnGenius WordPress sites, each with a production and a
 * staging copy.
 *
 * Production is never edited directly: someone overwrites the whole
 * production site with staging by hand in SiteGround. So a production record
 * carries the dates it was given on staging, and WordPress has no "went live"
 * time of its own.
 *
 * Env var names deliberately match the offline `wp-ds-check` skill's .env
 * (`WP_EU_URL`, `WP_EU_STG_APP_PASSWORD`, …) so one set of values can feed
 * both. SpecHub should still get its own Application Passwords, so either
 * side can be revoked without breaking the other.
 */

export const SITE_CODES = ["EU", "JP", "TW", "APAC", "IN"] as const;
export type SiteCode = (typeof SITE_CODES)[number];

export const SITE_ENVS = ["production", "staging"] as const;
export type SiteEnv = (typeof SITE_ENVS)[number];

/**
 * Languages each site publishes datasheets in, most preferred first.
 * TW takes Traditional Chinese and falls back to English; JP is Japanese only.
 */
export const SITE_LANGUAGES: Record<SiteCode, readonly ("en" | "ja" | "zh")[]> = {
  EU: ["en"],
  JP: ["ja"],
  TW: ["zh", "en"],
  APAC: ["en"],
  IN: ["en"],
};

export interface SiteConfig {
  code: SiteCode;
  env: SiteEnv;
  /** No trailing slash. Null when the env var is missing. */
  baseUrl: string | null;
  user: string | null;
  appPassword: string | null;
}

export function envPrefix(code: SiteCode, env: SiteEnv): string {
  return env === "staging" ? `WP_${code}_STG` : `WP_${code}`;
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function siteConfig(code: SiteCode, env: SiteEnv): SiteConfig {
  const prefix = envPrefix(code, env);
  return {
    code,
    env,
    baseUrl: readEnv(`${prefix}_URL`)?.replace(/\/+$/, "") ?? null,
    user: readEnv(`${prefix}_USER`),
    appPassword: readEnv(`${prefix}_APP_PASSWORD`),
  };
}

/** All ten site/environment pairs in the fixed EU, JP, TW, APAC, IN order. */
export function allSiteConfigs(): SiteConfig[] {
  return SITE_CODES.flatMap((code) => SITE_ENVS.map((env) => siteConfig(code, env)));
}

export function hasCredentials(config: SiteConfig): boolean {
  return Boolean(config.user && config.appPassword);
}
