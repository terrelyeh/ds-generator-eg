import { google } from "googleapis";

/**
 * The service-account client, built once per serverless instance.
 *
 * This used to construct a fresh `GoogleAuth` on every call, and it is called
 * per helper — `drive-images.ts` alone reaches for it eight times, which in a
 * sync means once per image per product. Each new instance starts with an
 * empty token cache, so each one paid for its own JWT exchange with Google
 * before it could do any work. A forced sync of a two-product line was
 * spending most of a 60-second budget on that and timing out.
 *
 * `GoogleAuth` is designed to be reused: it caches the access token and
 * refreshes it when it expires, and sharing one across concurrent calls is
 * the documented pattern rather than a shortcut.
 */
let cached: ReturnType<typeof build> | null = null;

function build() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set");
  }

  let credentials: { client_email: string; private_key: string };
  try {
    // Try parsing as raw JSON first
    credentials = JSON.parse(raw);
  } catch {
    // Try base64 decoding
    credentials = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

/** Create an authenticated Google API client using Service Account credentials. */
export function getGoogleAuth() {
  if (!cached) cached = build();
  return cached;
}
