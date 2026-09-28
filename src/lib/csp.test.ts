import { describe, it, expect } from "vitest";
import { appContentSecurityPolicy, generateNonce } from "./csp";

describe("appContentSecurityPolicy", () => {
  it("allows scripts only by nonce in production — no unsafe-inline/unsafe-eval", () => {
    const csp = appContentSecurityPolicy("abc123", false);
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("adds unsafe-eval only in development", () => {
    expect(appContentSecurityPolicy("n", true)).toContain("'unsafe-eval'");
    expect(appContentSecurityPolicy("n", false)).not.toContain("'unsafe-eval'");
  });
});

describe("generateNonce", () => {
  it("returns a fresh base64 value each call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a.length).toBeGreaterThanOrEqual(22);
    expect(a).not.toBe(b);
  });
});
