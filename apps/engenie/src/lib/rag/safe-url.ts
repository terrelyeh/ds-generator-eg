/**
 * Outbound fetching for the ingest pipelines.
 *
 * Every one of these takes a URL an editor typed into a dialog — the Web
 * dialog literally invites competitor pages — and fetches it from inside our
 * serverless functions, which sit next to a metadata service and can see the
 * VPC. So the URL is attacker-adjacent input and the fetch is the exit.
 *
 * The guard used to live privately inside `ingest-web.ts` and was applied at
 * exactly one call site, while the GitBook, Help Center and image fetchers
 * reached out with nothing at all. It also had two holes worth naming:
 *
 *   · a redirect was followed blind. `redirect: "follow"` is the default, so
 *     a page on a perfectly public host could 302 to 169.254.169.254 and the
 *     body came back as if it had always been public.
 *   · `::ffff:169.254.169.254` — the IPv4-mapped form — parses to a hostname
 *     of `[::ffff:a9fe:a9fe]`, which matched none of the IPv6 tests.
 *
 * And nothing had a timeout or a size limit, so one slow or enormous
 * response could hold a function open until it was killed.
 */

/** Is this URL safe to fetch from inside our own network? */
export function isSafePublicUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;

  // Credentials in the authority are a redirect trick more often than a
  // legitimate need, and nothing we ingest uses them.
  if (u.username || u.password) return false;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;

  // A trailing dot is the same name to a resolver and a different string here.
  const name = host.replace(/\.$/, "");
  if (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name.endsWith(".internal")
  ) {
    return false;
  }

  if (host.includes(":")) return isSafeIpv6(host);

  // Whole-number or hex IPv4 forms (http://2130706433/, http://0x7f000001/).
  if (/^\d+$/.test(host) || /^0x/i.test(host)) return false;

  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) return isSafeIpv4(Number(m[1]), Number(m[2]));

  return true;
}

function isSafeIpv4(a: number, b: number): boolean {
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local, and the metadata service
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a >= 224 // multicast and reserved
  );
}

function isSafeIpv6(host: string): boolean {
  if (host === "::" || host === "::1") return false;
  if (/^(fe80|fc|fd)/i.test(host)) return false;

  // IPv4 wearing an IPv6 costume. Both spellings reach the same address:
  // `::ffff:127.0.0.1` and the hex form `::ffff:7f00:1` that URL parsing
  // normalises it into. NAT64 (64:ff9b::) gets there too.
  const mapped = host.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (mapped) return isSafeIpv4(Number(mapped[1]), Number(mapped[2]));

  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const word = parseInt(hex[1], 16);
    return isSafeIpv4(word >> 8, word & 0xff);
  }

  if (/^64:ff9b:/i.test(host)) return false;

  return true;
}

export class UnsafeUrlError extends Error {
  constructor(url: string) {
    super(`Blocked non-public URL: ${url}`);
    this.name = "UnsafeUrlError";
  }
}

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

/**
 * Fetch a page for ingestion, checking every hop.
 *
 * Redirects are followed by hand (`redirect: "manual"`) so each `Location`
 * goes back through `isSafePublicUrl` — following them automatically means
 * only the first URL was ever checked, which is not a check at all.
 *
 * Throws `UnsafeUrlError` for a blocked URL so callers can put it in their
 * `errors[]` and carry on with the rest of the crawl, which is what the
 * ingest routes already do with the failures they know about.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  maxBytes = MAX_BYTES,
): Promise<{ text: string; finalUrl: string; contentType: string }> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafePublicUrl(current)) throw new UnsafeUrlError(current);

    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Redirect with no Location from ${current}`);
      current = new URL(location, current).toString();
      continue;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status} from ${current}`);

    return {
      text: await readCapped(res, maxBytes, current),
      finalUrl: current,
      contentType: res.headers.get("content-type") ?? "",
    };
  }

  throw new Error(`Too many redirects from ${url}`);
}

/** Read a body, giving up rather than buffering something enormous. */
async function readCapped(res: Response, maxBytes: number, url: string): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new Error(`Response too large (${declared} bytes) from ${url}`);
  }
  if (!res.body) return "";

  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded ${maxBytes} bytes from ${url}`);
    }
    parts.push(value);
  }
  return new TextDecoder().decode(
    parts.reduce<Uint8Array>((acc, p) => {
      const out = new Uint8Array(acc.length + p.length);
      out.set(acc);
      out.set(p, acc.length);
      return out;
    }, new Uint8Array(0)),
  );
}
