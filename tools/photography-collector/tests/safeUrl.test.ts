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

  it("recognizes private/internal addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("192.168.1.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});
