import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { generateApiKey, hashApiKey, looksLikeApiKey, API_KEY_ROLES } from "@/lib/apiKeys";
import { toApiJson } from "@/lib/api/v1";
import { roleCan } from "@/lib/rbac";

describe("API key generation", () => {
  it("makes 256-bit keys with a recognizable prefix and stores only a hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^fq_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 11));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.key.slice(3));
  });

  it("rejects anything that isn't key-shaped before any lookup", () => {
    expect(looksLikeApiKey(generateApiKey().key)).toBe(true);
    for (const bad of ["", "fq_short", "sk_" + "a".repeat(43), "fq_" + "a".repeat(42) + "!"]) expect(looksLikeApiKey(bad)).toBe(false);
  });

  it("only offers key roles that can't manage users or settings", () => {
    for (const role of API_KEY_ROLES) {
      for (const action of ["VIEW", "CREATE", "EDIT", "DELETE"] as const) {
        expect(roleCan(role, "settings", action), `${role} settings ${action}`).toBe(false);
        expect(roleCan(role, "users", action === "VIEW" ? "EDIT" : action), `${role} users`).toBe(false);
      }
      expect(roleCan(role, "journals", "APPROVE")).toBe(false); // no key can post to the ledger
    }
  });
});

describe("toApiJson", () => {
  it("writes money as exact strings and dates as ISO", () => {
    expect(toApiJson({ total: new Prisma.Decimal("1050.10"), at: new Date("2026-01-01T00:00:00Z"), lines: [{ q: new Prisma.Decimal("0.0001") }] })).toEqual({
      total: "1050.1",
      at: "2026-01-01T00:00:00.000Z",
      lines: [{ q: "0.0001" }],
    });
  });
});

describe("middleware matcher", () => {
  it("leaves /api/v1 to bearer auth and still session-gates the private API", () => {
    const src = readFileSync(path.resolve(__dirname, "../middleware.ts"), "utf8");
    // The last quoted /api/((?!…) string is the live matcher; an earlier one is quoted in a comment.
    const pattern = [...src.matchAll(/"(\/api\/\(\(\?![^"]+)"/g)].at(-1)![1]!;
    const re = new RegExp(`^${pattern}$`);
    expect(re.test("/api/v1/invoices")).toBe(false);
    expect(re.test("/api/v1/reports/trial-balance")).toBe(false);
    expect(re.test("/api/invoices")).toBe(true);
    expect(re.test("/api/api-keys")).toBe(true);
    expect(re.test("/api/v1x")).toBe(true);
  });
});
