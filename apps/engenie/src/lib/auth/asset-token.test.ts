import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAssetPath, verifyAssetToken, withAssetTokens } from "./asset-token";

const PATH = "internal_doc/craft-ai-srs/diagrams/craft-ai-product-stack-overview.svg";
const NOW = Date.UTC(2026, 8, 11, 12, 0, 0);

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ["WORKSPACE_TOKEN_SECRET", "API_KEY_ENC_SECRET"]) saved[k] = process.env[k];
  process.env.WORKSPACE_TOKEN_SECRET = "test-secret";
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("asset tokens", () => {
  it("verify for the path they were signed for, until they expire", async () => {
    const t = await signAssetPath(PATH, 3600, NOW);
    expect(await verifyAssetToken(PATH, t, NOW + 1000)).toBe(true);
    expect(await verifyAssetToken(PATH, t, NOW + 3601 * 1000)).toBe(false);
  });

  it("don't open a different image", async () => {
    const t = await signAssetPath(PATH, 3600, NOW);
    expect(await verifyAssetToken(PATH.replace("overview", "lifecycle"), t, NOW)).toBe(false);
  });

  it("reject a stretched expiry, a changed signature, and garbage", async () => {
    const t = (await signAssetPath(PATH, 3600, NOW))!;
    const [exp, sig] = t.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a");
    expect(await verifyAssetToken(PATH, `${Number(exp) + 86400}.${sig}`, NOW)).toBe(false);
    expect(await verifyAssetToken(PATH, `${exp}.${flipped}`, NOW)).toBe(false);
    expect(await verifyAssetToken(PATH, "nonsense", NOW)).toBe(false);
    expect(await verifyAssetToken(PATH, null, NOW)).toBe(false);
  });

  it("can be neither minted nor accepted without a secret", async () => {
    const t = await signAssetPath(PATH, 3600, NOW);
    delete process.env.WORKSPACE_TOKEN_SECRET;
    delete process.env.API_KEY_ENC_SECRET;
    expect(await signAssetPath(PATH, 3600, NOW)).toBeNull();
    expect(await verifyAssetToken(PATH, t, NOW)).toBe(false);
  });
});

describe("withAssetTokens", () => {
  it("signs asset URLs and leaves everything else alone", async () => {
    const out = await withAssetTokens([`/api/knowledge-assets/${PATH}`, "https://files.gitbook.com/x.png"], 3600, NOW);
    expect(out[1]).toBe("https://files.gitbook.com/x.png");
    const [base, token] = out[0].split("?t=");
    expect(base).toBe(`/api/knowledge-assets/${PATH}`);
    expect(await verifyAssetToken(PATH, token, NOW)).toBe(true);
  });

  it("signs the decoded storage path — the one the route checks", async () => {
    const out = await withAssetTokens(["/api/knowledge-assets/internal_doc/pkg/a%20b.png"], 3600, NOW);
    expect(await verifyAssetToken("internal_doc/pkg/a b.png", out[0].split("?t=")[1], NOW)).toBe(true);
  });
});
