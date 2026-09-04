import { describe, expect, it } from "vitest";
import { isSafePublicUrl } from "./safe-url";

describe("isSafePublicUrl", () => {
  it("allows ordinary public pages", () => {
    expect(isSafePublicUrl("https://doc.engenius.ai/cloud-licensing")).toBe(true);
    expect(isSafePublicUrl("http://example.com/a/b?c=1")).toBe(true);
  });

  it("blocks loopback and private ranges in every spelling", () => {
    for (const u of [
      "http://localhost/",
      "http://127.0.0.1/",
      "http://10.0.0.5:8080/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://169.254.169.254/latest/meta-data/", // the metadata service
      "http://2130706433/", // decimal
      "http://0x7f000001/", // hex
      "http://internal.local/",
      "http://svc.internal/",
      "http://100.64.0.1/", // carrier-grade NAT
    ]) {
      expect(isSafePublicUrl(u), u).toBe(false);
    }
  });

  it("blocks IPv4 addresses wearing an IPv6 costume", () => {
    // Both spellings reach the metadata service; URL parsing turns the first
    // into the second, which is why the dotted form alone was not enough.
    expect(isSafePublicUrl("http://[::ffff:169.254.169.254]/")).toBe(false);
    expect(isSafePublicUrl("http://[::ffff:a9fe:a9fe]/")).toBe(false);
    expect(isSafePublicUrl("http://[::ffff:127.0.0.1]/")).toBe(false);
    expect(isSafePublicUrl("http://[64:ff9b::a9fe:a9fe]/")).toBe(false);
  });

  it("blocks IPv6 loopback and link-local", () => {
    expect(isSafePublicUrl("http://[::1]/")).toBe(false);
    expect(isSafePublicUrl("http://[fe80::1]/")).toBe(false);
    expect(isSafePublicUrl("http://[fd00::1]/")).toBe(false);
  });

  it("blocks non-http schemes, credentials and a trailing-dot bypass", () => {
    expect(isSafePublicUrl("file:///etc/passwd")).toBe(false);
    expect(isSafePublicUrl("gopher://example.com/")).toBe(false);
    expect(isSafePublicUrl("http://user:pw@example.com/")).toBe(false);
    expect(isSafePublicUrl("http://localhost./")).toBe(false);
  });
});
