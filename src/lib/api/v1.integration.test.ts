/**
 * Public REST API (/api/v1) end to end against real Postgres: the real route
 * handlers, called with real bearer keys. Covers auth (missing, malformed,
 * revoked), tenant isolation (lists, by-id, cursors, smuggled references),
 * RBAC as the intersection of the key's role and its member's live
 * permissions, the plan gate, the rate limit, no secret columns in
 * responses, exact money, and draft creation.
 *
 * Runs only when DATABASE_URL and CI or RUN_DB_TESTS are set (same gate as
 * tenantIsolation.integration.test.ts).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const enabled = !!process.env.DATABASE_URL && !!(process.env.CI || process.env.RUN_DB_TESTS);

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

describe.skipIf(!enabled)("public REST API /api/v1 (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let keys: typeof import("@/lib/apiKeys");
  type Co = {
    companyId: string; membershipId: string; userId: string;
    customerId: string; supplierId: string; invoiceId: string; billId: string; readKey: string; writeKey: string;
  };
  let A: Co;
  let B: Co;
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  async function makeCompany(label: string): Promise<Co> {
    const { createCompanyForUser } = await import("@/lib/onboarding");
    const { createCustomer, createSupplier } = await import("@/lib/parties");
    const { createInvoice, postInvoiceToLedger } = await import("@/lib/sales");
    const { createBill } = await import("@/lib/purchases");
    const user = await prisma.user.create({
      data: { name: `API ${label}`, email: `api-${label}-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() },
    });
    const company = await createCompanyForUser({ userId: user.id, name: `API ${label} ${tag}`, countryCode: "AE", baseCurrency: "AED" });
    await prisma.subscription.update({ where: { companyId: company.id }, data: { plan: "PROFESSIONAL" } });
    const m = await prisma.companyMembership.findFirstOrThrow({ where: { companyId: company.id, userId: user.id } });
    const ctx = { companyId: company.id, membershipId: m.id, userId: user.id };
    const customer = await createCustomer({ ...ctx, name: `Customer ${label} ${tag}` } as never);
    await prisma.customer.update({ where: { id: customer.id }, data: { portalToken: `PORTALSECRET${label}${tag}` } });
    const supplier = await createSupplier({ ...ctx, name: `Supplier ${label} ${tag}` });
    const inv = await createInvoice({
      ...ctx, customerId: customer.id, issueDate: new Date(), dueDate: new Date(), currency: "AED",
      lines: [{ description: "Work", quantity: 3, unitPrice: 333.33 }],
    });
    await postInvoiceToLedger({ ...ctx, invoiceId: inv.id });
    await prisma.invoice.update({ where: { id: inv.id }, data: { payToken: `PAYSECRET${label}${tag}` } });
    const bill = await createBill({
      ...ctx, supplierId: supplier.id, issueDate: new Date(), dueDate: new Date(), currency: "AED",
      lines: [{ description: "Rent", quantity: 1, unitPrice: 500 }],
    } as never);
    const readKey = (await keys.createApiKey({ ...ctx, label: "read", role: "AUDITOR" })).key;
    const writeKey = (await keys.createApiKey({ ...ctx, label: "write", role: "ACCOUNTANT" })).key;
    return { ...ctx, customerId: customer.id, supplierId: supplier.id, invoiceId: inv.id, billId: bill.id, readKey, writeKey };
  }

  const routes: Record<string, () => Promise<Record<string, unknown>>> = {
    me: () => import("@/app/api/v1/me/route"),
    accounts: () => import("@/app/api/v1/accounts/route"),
    customers: () => import("@/app/api/v1/customers/route"),
    "customers/[id]": () => import("@/app/api/v1/customers/[id]/route"),
    suppliers: () => import("@/app/api/v1/suppliers/route"),
    invoices: () => import("@/app/api/v1/invoices/route"),
    "invoices/[id]": () => import("@/app/api/v1/invoices/[id]/route"),
    bills: () => import("@/app/api/v1/bills/route"),
    "bills/[id]": () => import("@/app/api/v1/bills/[id]/route"),
    "journal-entries": () => import("@/app/api/v1/journal-entries/route"),
    "journal-entries/[id]": () => import("@/app/api/v1/journal-entries/[id]/route"),
    "reports/trial-balance": () => import("@/app/api/v1/reports/trial-balance/route"),
    "reports/profit-and-loss": () => import("@/app/api/v1/reports/profit-and-loss/route"),
    "reports/balance-sheet": () => import("@/app/api/v1/reports/balance-sheet/route"),
    "reports/ar-aging": () => import("@/app/api/v1/reports/ar-aging/route"),
    "reports/ap-aging": () => import("@/app/api/v1/reports/ap-aging/route"),
  };

  async function call(path: string, opts: { key?: string | null; method?: string; query?: string; params?: Record<string, string>; body?: unknown } = {}) {
    const mod = await routes[path]!();
    const handler = mod[opts.method ?? "GET"] as Handler;
    const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" };
    if (opts.key) headers.authorization = `Bearer ${opts.key}`;
    const req = new Request(`http://localhost/api/v1/${path}${opts.query ? `?${opts.query}` : ""}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
    const text = await res.text();
    return { status: res.status, text, json: text ? JSON.parse(text) : null, headers: res.headers };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    keys = await import("@/lib/apiKeys");
    const { __useMemoryRateLimitsForTests } = await import("@/lib/rateLimit");
    __useMemoryRateLimitsForTests();
    A = await makeCompany("A");
    B = await makeCompany("B");
  }, 120_000);

  it("refuses requests without a valid, unrevoked key", async () => {
    expect((await call("me")).status).toBe(401);
    expect((await call("me", { key: "fq_" + "x".repeat(43) })).status).toBe(401);
    expect((await call("me", { key: "not-a-key" })).status).toBe(401);
    const { key, apiKey } = await keys.createApiKey({ ...A, label: "temp", role: "AUDITOR" });
    expect((await call("me", { key })).status).toBe(200);
    await keys.revokeApiKey({ ...A, apiKeyId: apiKey.id });
    const after = await call("me", { key });
    expect(after.status).toBe(401);
    expect(after.headers.get("www-authenticate")).toMatch(/Bearer/);
    expect(await prisma.auditEvent.count({ where: { entityId: apiKey.id, action: { in: ["api_key.created", "api_key.revoked"] } } })).toBe(2);
  });

  it("stores only a hash of each key", async () => {
    const row = await prisma.apiKey.findFirstOrThrow({ where: { companyId: A.companyId, label: "read" } });
    expect(row.keyHash).toBe(keys.hashApiKey(A.readKey));
    expect(JSON.stringify(row)).not.toContain(A.readKey);
  });

  it("scopes every read to the key's company", async () => {
    const me = await call("me", { key: A.readKey });
    expect(me.json.data.company.id).toBe(A.companyId);

    for (const path of ["accounts", "customers", "suppliers", "invoices", "bills", "journal-entries"]) {
      const res = await call(path, { key: A.readKey, query: "limit=100" });
      expect(res.status, path).toBe(200);
      for (const id of [B.companyId, B.customerId, B.supplierId, B.invoiceId, B.billId]) expect(res.text, `${path} leaks ${id}`).not.toContain(id);
    }
    expect((await call("invoices/[id]", { key: A.readKey, params: { id: B.invoiceId } })).status).toBe(404);
    expect((await call("bills/[id]", { key: A.readKey, params: { id: B.billId } })).status).toBe(404);
    expect((await call("customers/[id]", { key: A.readKey, params: { id: B.customerId } })).status).toBe(404);
    // A cursor naming another company's row is refused, not used as a page position.
    expect((await call("invoices", { key: A.readKey, query: `cursor=${B.invoiceId}` })).status).toBe(400);
  });

  it("returns exact money, invoice lines, and no secret columns", async () => {
    const res = await call("invoices/[id]", { key: A.readKey, params: { id: A.invoiceId } });
    expect(res.status).toBe(200);
    expect(res.json.data.subtotal).toBe("999.99");
    expect(res.json.data.lines[0].unitPrice).toBe("333.33");
    expect(res.text).not.toContain("PAYSECRET");
    expect(res.text).not.toMatch(/payToken|importRef/);
    const customers = await call("customers", { key: A.readKey });
    expect(customers.text).not.toContain("PORTALSECRET");
    expect(customers.text).not.toContain("portalToken");
  });

  it("paginates with an opaque cursor", async () => {
    const { createCustomer } = await import("@/lib/parties");
    for (let i = 0; i < 3; i++) await createCustomer({ ...A, name: `Paged ${i} ${tag}` } as never);
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let pageNo = 0; pageNo < 10; pageNo++) {
      const res = await call("customers", { key: A.readKey, query: `limit=2${cursor ? `&cursor=${cursor}` : ""}` });
      expect(res.status).toBe(200);
      for (const c of res.json.data) {
        expect(seen.has(c.id)).toBe(false);
        seen.add(c.id);
      }
      cursor = res.json.nextCursor;
      if (!cursor) break;
    }
    expect(seen.size).toBe(await prisma.customer.count({ where: { companyId: A.companyId } }));
  });

  it("serves the core reports", async () => {
    for (const [path, query] of [
      ["reports/trial-balance", "asOf=2099-12-31"],
      ["reports/profit-and-loss", "from=2000-01-01&to=2099-12-31"],
      ["reports/balance-sheet", "asOf=2099-12-31"],
      ["reports/ar-aging", ""],
      ["reports/ap-aging", ""],
    ] as const) {
      const res = await call(path, { key: A.readKey, query });
      expect(res.status, `${path} ${res.text.slice(0, 120)}`).toBe(200);
    }
    expect((await call("reports/profit-and-loss", { key: A.readKey })).status).toBe(400); // from/to required
    expect((await call("reports/trial-balance", { key: A.readKey, query: "asOf=31/12/2026" })).status).toBe(400);
    expect((await call("invoices", { key: A.readKey, query: "status=NOT_A_STATUS" })).status).toBe(400);
  });

  it("creates drafts only with a write key, and only against the key's own company", async () => {
    const body = { customerId: A.customerId, issueDate: "2026-09-01", dueDate: "2026-10-01", currency: "AED", lines: [{ description: "API", quantity: 2, unitPrice: "10.50" }] };
    expect((await call("invoices", { key: A.readKey, method: "POST", body })).status).toBe(403);
    const created = await call("invoices", { key: A.writeKey, method: "POST", body });
    expect(created.status, created.text).toBe(201);
    expect(created.json.data).toMatchObject({ status: "DRAFT", subtotal: "21" });
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: created.json.data.id } });
    expect(row.companyId).toBe(A.companyId);
    expect(row.journalEntryId).toBeNull(); // nothing posted

    const before = await prisma.invoice.count({ where: { companyId: A.companyId } });
    const smuggled = await call("invoices", { key: A.writeKey, method: "POST", body: { ...body, customerId: B.customerId } });
    expect(smuggled.status).toBeGreaterThanOrEqual(400);
    expect(smuggled.status).toBeLessThan(500);
    const companyInBody = await call("invoices", { key: A.writeKey, method: "POST", body: { ...body, companyId: B.companyId } });
    expect(companyInBody.status).toBe(400); // unknown fields are rejected outright
    expect(await prisma.invoice.count({ where: { companyId: A.companyId } })).toBe(before);
    expect(await prisma.invoice.count({ where: { companyId: B.companyId, customerId: B.customerId } })).toBe(1);

    const bill = await call("bills", {
      key: A.writeKey, method: "POST",
      body: { supplierId: A.supplierId, issueDate: "2026-09-01", dueDate: "2026-10-01", currency: "AED", lines: [{ description: "x", quantity: 1, unitPrice: 5 }] },
    });
    expect(bill.status, bill.text).toBe(201);
    expect(bill.json.data.status).toBe("DRAFT");
  });

  it("never exceeds the creating member's live permissions", async () => {
    const C = await makeCompany("C");
    expect((await call("reports/trial-balance", { key: C.readKey })).status).toBe(200);
    // Demote the admin who made the key to STAFF: no reports, but invoices VIEW remains.
    await prisma.companyMembership.update({ where: { id: C.membershipId }, data: { role: "STAFF" } });
    expect((await call("reports/trial-balance", { key: C.readKey })).status).toBe(403);
    expect((await call("invoices", { key: C.readKey })).status).toBe(200);
    // A per-member override revoking invoices VIEW applies to the key too.
    await prisma.permissionOverride.create({ data: { membershipId: C.membershipId, module: "invoices", action: "VIEW", granted: false } });
    expect((await call("invoices", { key: C.readKey })).status).toBe(403);
    // Deactivate the member: the key stops authenticating at all.
    await prisma.companyMembership.update({ where: { id: C.membershipId }, data: { isActive: false } });
    expect((await call("me", { key: C.readKey })).status).toBe(401);
  });

  it("turns keys off when the plan lacks API access, and gates creation on the plan and settings:EDIT", async () => {
    const D = await makeCompany("D");
    await prisma.subscription.update({ where: { companyId: D.companyId }, data: { plan: "GROWTH" } });
    const res = await call("me", { key: D.readKey });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("plan_required");
    await expect(keys.createApiKey({ ...D, label: "x", role: "AUDITOR" })).rejects.toThrow(keys.ApiKeyError);

    const user = await prisma.user.create({ data: { name: "Acct", email: `api-acct-${tag}@t.local`, passwordHash: "x" } });
    const m = await prisma.companyMembership.create({ data: { companyId: A.companyId, userId: user.id, role: "ACCOUNTANT" } });
    const { ForbiddenError } = await import("@/lib/rbac");
    await expect(keys.createApiKey({ companyId: A.companyId, membershipId: m.id, userId: user.id, label: "x", role: "AUDITOR" })).rejects.toThrow(ForbiddenError);
  });

  it("rate-limits each key", async () => {
    const E = await makeCompany("E");
    const { API_RATE_LIMIT } = await import("@/lib/api/v1");
    let last = 0;
    for (let i = 0; i <= API_RATE_LIMIT.max; i++) last = (await call("me", { key: E.readKey })).status;
    expect(last).toBe(429);
    expect((await call("me", { key: E.writeKey })).status).toBe(200); // other keys unaffected
  }, 60_000);
});
