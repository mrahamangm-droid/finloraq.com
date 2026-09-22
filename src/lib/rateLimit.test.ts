import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimitsForTests, clientIpFromHeaders } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimitsForTests());

  it("allows up to the configured max within the window", () => {
    const key = "test:allow";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
    }
  });

  it("blocks the (max+1)th hit within the window", () => {
    const key = "test:block";
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, 60_000);
    const result = checkRateLimit(key, 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks separate keys independently", () => {
    checkRateLimit("a", 1, 60_000);
    const resultA = checkRateLimit("a", 1, 60_000);
    const resultB = checkRateLimit("b", 1, 60_000);
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
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
