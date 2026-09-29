import { describe, it, expect } from "vitest";
import { appContentSecurityPolicy, generateNonce, sentryConnectOrigin } from "./csp";

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

describe("sentryConnectOrigin", () => {
  it("allows only the DSN's https origin, and nothing when unset or malformed", () => {
    expect(sentryConnectOrigin("https://abc@o123.ingest.sentry.io/456")).toBe("https://o123.ingest.sentry.io");
    expect(sentryConnectOrigin(undefined)).toBeNull();
    expect(sentryConnectOrigin("")).toBeNull();
    expect(sentryConnectOrigin("not a url")).toBeNull();
    expect(sentryConnectOrigin("http://abc@insecure.example/1")).toBeNull();
  });

  it("keeps connect-src at 'self' with no DSN configured", () => {
    const connect = appContentSecurityPolicy("n", false).split("; ").find((d) => d.startsWith("connect-src"));
    expect(connect).toBe(process.env.NEXT_PUBLIC_SENTRY_DSN ? expect.stringContaining("'self' https://") : "connect-src 'self'");
  });
});
