import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { NextConfig } from "next";
import { config } from "@/middleware";
// @ts-expect-error -- next.config.mjs is plain JS with a JSDoc type only.
import rawNextConfig from "../../next.config.mjs";

const nextConfig = rawNextConfig as NextConfig;

/**
 * Every signed-in app section (a top-level folder under src/app/(app)) must be
 * (1) behind the middleware's auth gate and (2) excluded from next.config's
 * static 'unsafe-inline' CSP so it gets the middleware's per-request nonce CSP.
 * Both lists are hand-written literals (Next requires the matcher to be
 * statically analysable), and nine sections added after them were missing
 * from both until this test existed.
 */
const appDir = path.join(process.cwd(), "src/app/(app)");
const segments = readdirSync(appDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("(") && !d.name.startsWith("_"))
  .map((d) => d.name)
  .sort();

describe("signed-in app route protection", () => {
  it("finds the app sections", () => {
    expect(segments).toEqual(expect.arrayContaining(["dashboard", "crm", "settings"]));
  });

  it("puts every app section behind the middleware matcher", () => {
    const missing = segments.filter((s) => !config.matcher.includes(`/${s}/:path*`));
    expect(missing).toEqual([]);
  });

  it("keeps webhooks, cron, public, pay and NextAuth API routes outside the session gate", () => {
    const apiMatcher = config.matcher.find((m) => m.startsWith("/api/"))!;
    // Next compiles matchers with path-to-regexp; the capture group is a plain regex.
    const inner = new RegExp(`^/api/${apiMatcher.slice("/api/".length).replace(/^\(/, "(?:")}$`);
    for (const open of ["auth/session", "webhooks/stripe", "cron/recurring-invoices", "public/pricing", "pay/tok/checkout"]) {
      expect(inner.test(`/api/${open}`), open).toBe(false);
    }
    for (const gated of ["crm/leads", "billing/subscription", "ai/copilot", "invoices"]) {
      expect(inner.test(`/api/${gated}`), gated).toBe(true);
    }
  });

  it("excludes every app section from the static marketing CSP", async () => {
    const rules = await nextConfig.headers!();
    const csp = rules.find((r) => r.headers.some((h) => h.key === "Content-Security-Policy"))!;
    const source = new RegExp(`^/${csp.source.replace(/^\/:path\(/, "(?:").replace(/\)$/, "")}$`.replace("(?:(?!", "(?!"));
    const stillStatic = segments.filter((s) => source.test(`/${s}`) || source.test(`/${s}/x`));
    expect(stillStatic).toEqual([]);
    // …while marketing pages keep it.
    for (const page of ["", "pricing", "login", "sales-onboarding"]) {
      expect(source.test(`/${page}`), page).toBe(true);
    }
  });
});
