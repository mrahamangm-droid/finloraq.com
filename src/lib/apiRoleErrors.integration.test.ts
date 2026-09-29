/**
 * Every session-authenticated API route, called by a low-privilege member
 * (STAFF, AUDITOR) with an empty body and ids that don't exist, must answer
 * with a 4xx (or the explicit 501/503 an unconfigured integration answers,
 * per CLAUDE.md), never an uncaught throw (a 500 in Next.js — and, with Sentry
 * configured, a false error alert for what is really "not allowed").
 *
 * When this was written, 9 routes let a ForbiddenError from requirePermission
 * escape (products, billing change-plan/portal, bill approve, invoice
 * post/payment-link/submit-einvoice, voice confirm); they now go through
 * withApiErrors (src/lib/apiHandler.ts).
 *
 * Routes discovered by glob, so a new route is covered automatically.
 * Same opt-in as the other *.integration tests: DATABASE_URL + CI or RUN_DB_TESTS.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let sessionUserId: string | null = null;

vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth")>();
  return { ...actual, getServerSession: vi.fn(async () => (sessionUserId ? { user: { id: sessionUserId } } : null)) };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.77" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const enabled = !!process.env.DATABASE_URL && !!(process.env.CI || process.env.RUN_DB_TESTS);

// Routes outside the session gate (src/middleware.ts) authenticate differently.
const NOT_SESSION_ROUTES = /\/api\/(webhooks|cron|auth|public|pay|register)\//;
const routeModules = import.meta.glob("/src/app/api/**/route.ts") as Record<string, () => Promise<Record<string, unknown>>>;

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

describe.skipIf(!enabled)("API routes refuse low-privilege roles with a 4xx, not a 500 (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  const users: Record<string, string> = {};

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const { createCompanyForUser } = await import("@/lib/onboarding");
    const { __useMemoryRateLimitsForTests } = await import("@/lib/rateLimit");
    __useMemoryRateLimitsForTests();
    const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const owner = await prisma.user.create({ data: { name: "Owner", email: `roles-owner-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() } });
    const company = await createCompanyForUser({ userId: owner.id, name: `Roles ${tag}`, countryCode: "AE", baseCurrency: "AED" });
    for (const role of ["STAFF", "AUDITOR"] as const) {
      const u = await prisma.user.create({ data: { name: role, email: `roles-${role.toLowerCase()}-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() } });
      await prisma.companyMembership.create({ data: { companyId: company.id, userId: u.id, role } });
      users[role] = u.id;
    }
  }, 60_000);

  afterAll(async () => {
    sessionUserId = null;
    await prisma?.$disconnect();
  });

  it("covers the route tree", () => {
    expect(Object.keys(routeModules).filter((f) => !NOT_SESSION_ROUTES.test(f)).length).toBeGreaterThan(80);
  });

  it("never throws for STAFF or AUDITOR", async () => {
    const uncaught: string[] = [];
    const params = { id: "nonexistent", token: "nonexistent", documentId: "nonexistent", accountId: "nonexistent", reconId: "nonexistent" };
    for (const [file, load] of Object.entries(routeModules)) {
      if (NOT_SESSION_ROUTES.test(file)) continue;
      const mod = await load();
      for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
        const handler = mod[method] as Handler | undefined;
        if (!handler) continue;
        for (const role of ["STAFF", "AUDITOR"]) {
          sessionUserId = users[role]!;
          const hasBody = method !== "GET" && method !== "DELETE";
          const req = new Request("http://localhost/api/test", {
            method,
            headers: { "content-type": "application/json" },
            body: hasBody ? "{}" : undefined,
          });
          try {
            const res = await handler(req, { params: Promise.resolve(params) });
            // 501/503: an integration (Stripe Connect, AI, ...) that isn't configured here — an explicit answer, not a crash.
            if (res.status >= 500 && res.status !== 501 && res.status !== 503) uncaught.push(`${role} ${method} ${file} → ${res.status}`);
          } catch (err) {
            uncaught.push(`${role} ${method} ${file} → threw ${(err as Error).name}: ${(err as Error).message.slice(0, 80)}`);
          }
        }
      }
    }
    expect(uncaught).toEqual([]);
  }, 120_000);
});
