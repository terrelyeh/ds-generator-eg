import { google } from "googleapis";

/**
 * Create an authenticated Google API client using Service Account credentials.
 * Reads from GOOGLE_SERVICE_ACCOUNT_JSON env var (raw JSON or base64-encoded).
 */
export function getGoogleAuth() {
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

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  return auth;
}
