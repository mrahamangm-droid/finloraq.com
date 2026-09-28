import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __useMemoryRateLimitsForTests, clientIpFromHeaders, evaluateWindow, hashRateLimitKey } from "./rateLimit";

describe("evaluateWindow (shared by the database and memory stores)", () => {
  it("allows while under the limit and counts the new hit", () => {
    const r = evaluateWindow([1000, 2000], 3000, 3, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
    expect(r.inWindow).toEqual([1000, 2000, 3000]);
  });

  it("blocks at the limit without counting the refused hit", () => {
    const r = evaluateWindow([1000, 2000, 3000], 4000, 3, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.inWindow).toEqual([1000, 2000, 3000]);
    expect(r.resetAt.getTime()).toBe(61_000);
  });

  it("slides: hits older than the window no longer count", () => {
    const r = evaluateWindow([1000, 2000, 3000], 62_000, 3, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.inWindow).toEqual([2000, 3000, 62_000].filter((t) => 62_000 - t < 60_000));
  });

  it("orders unsorted hits so resetAt is the oldest one's expiry", () => {
    const r = evaluateWindow([5000, 1000], 6000, 5, 10_000);
    expect(r.resetAt.getTime()).toBe(11_000);
  });
});

describe("hashRateLimitKey", () => {
  it("never stores the raw key (keys can contain an email)", () => {
    const h = hashRateLimitKey("login:someone@example.com");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("example");
    expect(hashRateLimitKey("login:someone@example.com")).toBe(h);
  });
});

describe("checkRateLimit (memory store)", () => {
  beforeEach(() => __useMemoryRateLimitsForTests());

  it("allows up to the configured max within the window", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await checkRateLimit("test:allow", 5, 60_000)).allowed).toBe(true);
    }
  });

  it("blocks the (max+1)th hit within the window", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("test:block", 3, 60_000);
    const result = await checkRateLimit("test:block", 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks separate keys independently", async () => {
    await checkRateLimit("a", 1, 60_000);
    expect((await checkRateLimit("a", 1, 60_000)).allowed).toBe(false);
    expect((await checkRateLimit("b", 1, 60_000)).allowed).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers the first entry of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.9" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("returns 'unknown' when nothing is present", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
    expect(clientIpFromHeaders(undefined)).toBe("unknown");
  });
});
