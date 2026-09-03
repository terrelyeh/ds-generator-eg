/**
 * Validate a post-login destination.
 *
 * `next` reaches us from a query string — `proxy.ts` puts the blocked path
 * there, the sign-in form stashes it, and the redirector navigates to it —
 * so it is attacker-supplied all the way through.
 *
 * A leading slash is not enough to make it local. `//evil.example` and
 * `/\evil.example` both satisfy `startsWith("/")`, and both send the browser
 * to another origin with a freshly-minted session already in hand. That is
 * exactly what makes a corporate login page worth phishing: the victim sees
 * the real Google consent screen and a real successful login, and only then
 * gets moved somewhere else.
 *
 * Lives in @eg/auth rather than in each app because SpecHub and EnGenie ship
 * byte-identical copies of the sign-in flow, and a check that has to be
 * remembered twice gets fixed once.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value) return fallback;
  // One leading slash, and the next character must not start an authority
  // (`//host`) or its backslash-tolerant variant that browsers normalise.
  return /^\/(?![/\\])/.test(value) ? value : fallback;
}
