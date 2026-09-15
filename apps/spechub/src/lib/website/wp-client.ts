import { hasCredentials, type SiteConfig } from "./sites";

/**
 * Read-only access to a regional WordPress site's REST API.
 *
 * Every call reports what came back rather than throwing, because "the site
 * answered with a login page or a bot challenge" and "the site said there is
 * nothing here" have to stay distinguishable — the second is a finding about
 * the website, the first is a finding about us.
 */

export type WpResponseKind = "json" | "html" | "empty" | "other" | "timeout" | "network";

export interface WpResult<T> {
  /** HTTP status, or null when no response arrived. */
  status: number | null;
  kind: WpResponseKind;
  ms: number;
  data: T | null;
  /** `X-WP-Total` for collection requests. */
  total: number | null;
  /** Location of a redirect. Redirects are not followed. */
  redirect: string | null;
  /** The body looked like a bot challenge rather than WordPress. */
  challenged: boolean;
}

const USER_AGENT = "EnGenius-SpecHub/1.0 (website datasheet check)";
const CHALLENGE_MARKERS = /sgcaptcha|captcha|cf-challenge|are you a robot|access denied/i;

export async function wpGet<T = unknown>(
  config: SiteConfig,
  path: string,
  options: { auth?: boolean; timeoutMs?: number } = {},
): Promise<WpResult<T>> {
  const started = Date.now();
  const empty = (kind: WpResponseKind, status: number | null = null): WpResult<T> => ({
    status,
    kind,
    ms: Date.now() - started,
    data: null,
    total: null,
    redirect: null,
    challenged: false,
  });
  if (!config.baseUrl) return empty("network");

  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": USER_AGENT };
  if (options.auth && hasCredentials(config)) {
    const token = Buffer.from(`${config.user}:${config.appPassword}`).toString("base64");
    headers.Authorization = `Basic ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return empty(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }

  const totalHeader = response.headers.get("x-wp-total");
  const base = {
    status: response.status,
    total: totalHeader !== null && totalHeader !== "" ? Number(totalHeader) : null,
    redirect: response.headers.get("location"),
  };
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const ms = Date.now() - started;

  if (!text.trim()) return { ...base, kind: "empty", ms, data: null, challenged: false };
  if (contentType.includes("json")) {
    try {
      return { ...base, kind: "json", ms, data: JSON.parse(text) as T, challenged: false };
    } catch {
      // A JSON content type with a non-JSON body is usually an interstitial.
    }
  }
  const head = text.slice(0, 4000);
  return {
    ...base,
    kind: contentType.includes("html") || head.trimStart().startsWith("<") ? "html" : "other",
    ms,
    data: null,
    challenged: CHALLENGE_MARKERS.test(head),
  };
}
