import { describe, expect, it, vi } from "vitest";
import { checkEnv, validateEnvAtStartup } from "@/lib/env";

const base = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@h/db",
  NEXTAUTH_SECRET: "x".repeat(44),
  CRON_SECRET: "c",
};

describe("checkEnv", () => {
  it("passes a minimal complete production config", () => {
    expect(checkEnv(base)).toEqual({ errors: [], warnings: [] });
  });

  it("errors on missing DATABASE_URL / NEXTAUTH_SECRET, naming the variable only", () => {
    const { errors } = checkEnv({ NODE_ENV: "production" });
    expect(errors.join(" ")).toContain("DATABASE_URL");
    expect(errors.join(" ")).toContain("NEXTAUTH_SECRET");
  });

  it("never echoes a secret value", () => {
    const report = checkEnv({ ...base, NEXTAUTH_SECRET: "short-secret-value", STRIPE_SECRET_KEY: "sk_live_SUPERSECRET" , VERCEL_ENV: "preview" });
    const text = JSON.stringify(report);
    expect(text).not.toContain("short-secret-value");
    expect(text).not.toContain("SUPERSECRET");
    expect(report.warnings.some((w) => w.includes("LIVE key outside production"))).toBe(true);
  });

  it("warns on half-configured integrations", () => {
    const { warnings } = checkEnv({ ...base, STRIPE_SECRET_KEY: "sk_test_1", GOOGLE_CLIENT_SECRET: "g", RESEND_API_KEY: "re_1" });
    expect(warnings.some((w) => w.includes("STRIPE_WEBHOOK_SECRET"))).toBe(true);
    expect(warnings.some((w) => w.includes("GOOGLE_CLIENT_ID"))).toBe(true);
    expect(warnings.some((w) => w.includes("EMAIL_FROM"))).toBe(true);
    expect(warnings.some((w) => w.includes("test key in production"))).toBe(true);
  });

  it("warns about a missing CRON_SECRET only in production", () => {
    const { CRON_SECRET: _unused, ...noCron } = base;
    expect(checkEnv(noCron).warnings.some((w) => w.includes("CRON_SECRET"))).toBe(true);
    expect(checkEnv({ ...noCron, NODE_ENV: "development" }).warnings.some((w) => w.includes("CRON_SECRET"))).toBe(false);
  });

  it("flags malformed Sentry DSNs and encryption keys", () => {
    const { warnings } = checkEnv({ ...base, SENTRY_DSN: "nope", FIELD_ENCRYPTION_KEY: "dG9vc2hvcnQ=" });
    expect(warnings.some((w) => w.includes("SENTRY_DSN"))).toBe(true);
    expect(warnings.some((w) => w.includes("FIELD_ENCRYPTION_KEY"))).toBe(true);
    expect(checkEnv({ ...base, SENTRY_DSN: "https://k@o1.ingest.sentry.io/2" }).warnings).toEqual([]);
  });
});

describe("validateEnvAtStartup", () => {
  it("throws only for a production server, not a build or dev", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => validateEnvAtStartup({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
    expect(() => validateEnvAtStartup({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).not.toThrow();
    expect(() => validateEnvAtStartup({ NODE_ENV: "development" })).not.toThrow();
    quiet.mockRestore();
    warn.mockRestore();
  });
});
