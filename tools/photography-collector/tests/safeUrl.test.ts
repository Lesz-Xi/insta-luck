import { describe, expect, it } from "vitest";
import { assertSafeMediaUrl, isAllowedHost, isPrivateAddress } from "../src/download/safeUrl.js";

describe("safeUrl", () => {
  it("allows Instagram CDN hosts", () => {
    expect(isAllowedHost("scontent-sea5-1.cdninstagram.com")).toBe(true);
    expect(isAllowedHost("cdninstagram.com")).toBe(true);
    expect(isAllowedHost("example.com")).toBe(false);
  });

  it("rejects non-HTTPS media URLs", async () => {
    await expect(assertSafeMediaUrl("http://scontent-sea5-1.cdninstagram.com/a.jpg", { resolveDns: false })).rejects.toThrow(
      /HTTPS/
    );
  });

  it("rejects unexpected hosts", async () => {
    await expect(assertSafeMediaUrl("https://example.com/a.jpg", { resolveDns: false })).rejects.toThrow(/not allowed/);
  });

  it.each([
    "https://scontent.cdninstagram.com:8443/a.jpg",
    "https://user:pass@scontent.cdninstagram.com/a.jpg",
    "https://user@scontent.cdninstagram.com/a.jpg"
  ])("rejects %s", async (url) => {
    await expect(assertSafeMediaUrl(url, { resolveDns: false })).rejects.toMatchObject({ code: "unsafe_url" });
  });

  it("allows the default HTTPS port written out", async () => {
    await expect(
      assertSafeMediaUrl("https://scontent.cdninstagram.com:443/a.jpg", { resolveDns: false })
    ).resolves.toBeInstanceOf(URL);
  });

  it("recognizes private/internal addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("192.168.1.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it.each([
    "0.0.0.0",
    "100.64.0.1",
    "100.100.100.200",
    "169.254.169.254",
    "172.31.255.255",
    "198.18.0.1",
    "203.0.113.9",
    "240.0.0.1",
    "::",
    "::1",
    "::127.0.0.1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:172.16.0.1",
    "::ffff:169.254.169.254",
    "::ffff:a00:1",
    "64:ff9b::a00:1",
    "2001:db8::1",
    "2002:7f00:1::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "febf::1",
    "fec0::1",
    "ff02::1",
    "fe80::1%lo0",
    "3fff::1",
    "::ffff:0:a00:1",
    "not-an-address"
  ])("treats %s as not public", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "157.240.1.174", "::ffff:8.8.8.8", "2a03:2880:f12f:83:face:b00c:0:25de"])(
    "treats %s as public",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    }
  );
});
