/**
 * Workspace passcode hashing.
 *
 * Passcodes were stored as bare sha256 — no salt, no work factor — so two
 * workspaces with the same passcode had the same hash, and a leaked table
 * could be run against a wordlist at hardware speed. Passcodes here are
 * short and shared, which makes them exactly the kind that fall to that.
 *
 * New hashes are `scrypt$<salt>$<hash>`. Old bare-hex hashes still verify,
 * and ws-auth rehashes one the moment it verifies, so the table migrates
 * itself as people sign in; a workspace nobody signs into keeps its old
 * hash and its old weakness until someone sets a passcode again.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passcode, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Bare 64-hex = the pre-2026-09 sha256 form. */
export function isLegacyHash(stored: string): boolean {
  return /^[0-9a-f]{64}$/i.test(stored);
}

export function verifyPasscode(passcode: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (isLegacyHash(stored)) {
    const h = createHash("sha256").update(passcode).digest();
    return safeEqual(h, Buffer.from(stored, "hex"));
  }
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const got = scryptSync(passcode, Buffer.from(saltHex, "hex"), expected.length, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return safeEqual(got, expected);
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
