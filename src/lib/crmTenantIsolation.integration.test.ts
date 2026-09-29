/**
 * CRM cross-tenant isolation, end to end against real Postgres.
 *
 * The CRM routes take several foreign keys from the request body (assignee,
 * customer, contact, lead, deal, stage). Before this suite they were written
 * as-is, so company A could point its own lead/deal/activity at company B's
 * records and read B's names and emails back through A's list endpoints.
 *
 * Signed in as A's admin, this calls the real route handlers with B's ids and
 * checks every attempt is refused with a 4xx (never 2xx, never an uncaught
 * 500), that B's CRM rows are unchanged, and that nothing A owns references B.
 * Also covers the shared error mapping (403 for a role without CRM access,
 * 400 for a malformed body) and list pagination bounds.
 *
 * Same opt-in as tenantIsolation.integration.test.ts: needs DATABASE_URL and
 * CI or RUN_DB_TESTS.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let sessionUserId: string | null = null;

vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth")>();
  return { ...actual, getServerSession: vi.fn(async () => (sessionUserId ? { user: { id: sessionUserId } } : null)) };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.10" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const enabled = !!process.env.DATABASE_URL && !!(process.env.CI || process.env.RUN_DB_TESTS);

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Mod = Record<string, unknown>;

interface Crm {
  userId: string;
  companyId: string;
  membershipId: string;
  customerId: string;
  leadId: string;
  contactId: string;
  dealId: string;
  pipelineId: string;
  stageIds: string[];
  activityId: string;
}

describe.skipIf(!enabled)("CRM tenant isolation (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let A: Crm;
  let B: Crm;
  let accountantUserId: string;
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  async function makeCompany(label: string): Promise<Crm> {
    const { createCompanyForUser } = await import("@/lib/onboarding");
    const crm = await import("@/lib/crm");
    const user = await prisma.user.create({
      data: { name: `Crm ${label}`, email: `crm-${label.toLowerCase()}-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() },
    });
    const company = await createCompanyForUser({ userId: user.id, name: `Crm ${label} ${tag}`, countryCode: "AE", baseCurrency: "AED" });
    const m = await prisma.companyMembership.findFirstOrThrow({ where: { companyId: company.id, userId: user.id } });
    const customer = await prisma.customer.create({ data: { companyId: company.id, name: `Customer ${label}`, email: `c-${label}@t.local` } });
    const pipeline = await crm.getOrCreateDefaultPipeline(company.id);
    const lead = await crm.createLead(company.id, m.id, { firstName: "Lead", lastName: label, email: `lead-${label}@t.local`, assignedToId: m.id });
    const contact = await crm.createContact(company.id, { firstName: "Contact", lastName: label, customerId: customer.id });
    const deal = await crm.createDeal(company.id, m.id, {
      name: `Deal ${label}`, value: 100, pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id,
      customerId: customer.id, contactId: contact.id, assignedToId: m.id,
    });
    const activity = await crm.createActivity(company.id, m.id, { type: "CALL", subject: `Call ${label}`, leadId: lead.id, dealId: deal.id });
    return {
      userId: user.id, companyId: company.id, membershipId: m.id, customerId: customer.id,
      leadId: lead.id, contactId: contact.id, dealId: deal.id, pipelineId: pipeline.id,
      stageIds: pipeline.stages.map((s) => s.id), activityId: activity.id,
    };
  }

  async function crmSnapshot(companyId: string): Promise<string> {
    const where = { companyId };
    const byId = { orderBy: { id: "asc" as const } };
    return JSON.stringify({
      leads: await prisma.lead.findMany({ where, ...byId }),
      contacts: await prisma.crmContact.findMany({ where, ...byId }),
      deals: await prisma.deal.findMany({ where, ...byId }),
      activities: await prisma.crmActivity.findMany({ where, ...byId }),
      pipelines: await prisma.pipeline.findMany({ where, ...byId }),
      stages: await prisma.pipelineStage.findMany({ where, ...byId }),
    });
  }

  const routes: Record<string, () => Promise<Mod>> = {
    "crm/leads": () => import("@/app/api/crm/leads/route"),
    "crm/leads/[id]": () => import("@/app/api/crm/leads/[id]/route"),
    "crm/leads/[id]/convert": () => import("@/app/api/crm/leads/[id]/convert/route"),
    "crm/contacts": () => import("@/app/api/crm/contacts/route"),
    "crm/contacts/[id]": () => import("@/app/api/crm/contacts/[id]/route"),
    "crm/deals": () => import("@/app/api/crm/deals/route"),
    "crm/deals/[id]": () => import("@/app/api/crm/deals/[id]/route"),
    "crm/deals/[id]/move": () => import("@/app/api/crm/deals/[id]/move/route"),
    "crm/activities": () => import("@/app/api/crm/activities/route"),
    "crm/activities/[id]/done": () => import("@/app/api/crm/activities/[id]/done/route"),
    "crm/pipelines/summary": () => import("@/app/api/crm/pipelines/summary/route"),
  };

  async function call(
    path: string, method: string, params: Record<string, string> = {}, body?: unknown, opts: { query?: string; raw?: string } = {}
  ): Promise<{ status: number; body: string }> {
    const mod = await routes[path]!();
    const handler = mod[method] as Handler | undefined;
    if (!handler) throw new Error(`no ${method} handler on ${path}`);
    const req = new Request(`http://localhost/api/${path}${opts.query ?? ""}`, {
      method,
      headers: { "content-type": "application/json" },
      body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    try {
      const res = await handler(req, { params: Promise.resolve(params) });
      return { status: res.status, body: await res.text() };
    } catch (err) {
      return { status: 500, body: err instanceof Error ? err.message : String(err) };
    }
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    A = await makeCompany("A");
    B = await makeCompany("B");
    const accountant = await prisma.user.create({
      data: { name: "Crm Accountant", email: `crm-acct-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() },
    });
    await prisma.companyMembership.create({ data: { companyId: A.companyId, userId: accountant.id, role: "ACCOUNTANT" } });
    accountantUserId = accountant.id;
  }, 120_000);

  afterAll(async () => {
    sessionUserId = null;
    await prisma?.$disconnect();
  });

  it("refuses B's ids in request bodies and by-id routes, and leaves B's CRM rows untouched", async () => {
    const before = await crmSnapshot(B.companyId);
    sessionUserId = A.userId;

    const attempts: [string, string, Record<string, string>, unknown?][] = [
      // Foreign keys in bodies.
      ["crm/leads", "POST", {}, { firstName: "X", lastName: "Y", assignedToId: B.membershipId }],
      ["crm/leads/[id]", "PATCH", { id: A.leadId }, { assignedToId: B.membershipId }],
      ["crm/contacts", "POST", {}, { firstName: "X", lastName: "Y", customerId: B.customerId }],
      ["crm/contacts/[id]", "PATCH", { id: A.contactId }, { customerId: B.customerId }],
      ["crm/deals", "POST", {}, { name: "X", value: 1, customerId: B.customerId }],
      ["crm/deals", "POST", {}, { name: "X", value: 1, contactId: B.contactId }],
      ["crm/deals", "POST", {}, { name: "X", value: 1, assignedToId: B.membershipId }],
      ["crm/deals", "POST", {}, { name: "X", value: 1, pipelineId: B.pipelineId, stageId: B.stageIds[0] }],
      ["crm/deals/[id]", "PATCH", { id: A.dealId }, { customerId: B.customerId }],
      ["crm/deals/[id]", "PATCH", { id: A.dealId }, { contactId: B.contactId }],
      ["crm/deals/[id]", "PATCH", { id: A.dealId }, { assignedToId: B.membershipId }],
      ["crm/deals/[id]", "PATCH", { id: A.dealId }, { stageId: B.stageIds[1] }],
      ["crm/deals/[id]/move", "POST", { id: A.dealId }, { stageId: B.stageIds[1] }],
      ["crm/activities", "POST", {}, { type: "CALL", subject: "X", leadId: B.leadId }],
      ["crm/activities", "POST", {}, { type: "CALL", subject: "X", dealId: B.dealId }],
      ["crm/activities", "POST", {}, { type: "CALL", subject: "X", contactId: B.contactId }],
      ["crm/activities", "POST", {}, { type: "CALL", subject: "X", customerId: B.customerId }],
      ["crm/activities", "POST", {}, { type: "CALL", subject: "X", assignedToId: B.membershipId }],
      // B's records by id.
      ["crm/leads/[id]", "GET", { id: B.leadId }],
      ["crm/leads/[id]", "PATCH", { id: B.leadId }, { notes: "hijack" }],
      ["crm/leads/[id]", "DELETE", { id: B.leadId }],
      ["crm/leads/[id]/convert", "POST", { id: B.leadId }, { customerName: "Hijack" }],
      ["crm/contacts/[id]", "GET", { id: B.contactId }],
      ["crm/contacts/[id]", "PATCH", { id: B.contactId }, { title: "hijack" }],
      ["crm/contacts/[id]", "DELETE", { id: B.contactId }],
      ["crm/deals/[id]", "GET", { id: B.dealId }],
      ["crm/deals/[id]", "PATCH", { id: B.dealId }, { notes: "hijack" }],
      ["crm/deals/[id]", "DELETE", { id: B.dealId }],
      ["crm/deals/[id]/move", "POST", { id: B.dealId }, { stageId: B.stageIds[1] }],
      ["crm/activities/[id]/done", "POST", { id: B.activityId }],
    ];

    const failures: string[] = [];
    for (const [path, method, params, body] of attempts) {
      const res = await call(path, method, params, body);
      if (res.status < 400 || res.status >= 500) {
        failures.push(`${method} ${path} ${JSON.stringify(body ?? params)} → ${res.status} ${res.body.slice(0, 120)}`);
      }
    }
    expect(failures).toEqual([]);
    expect(await crmSnapshot(B.companyId)).toBe(before);

    // Nothing A owns points at B.
    const bIds = [B.membershipId, B.customerId, B.contactId, B.leadId, B.dealId, ...B.stageIds];
    const aRows = JSON.stringify({
      leads: await prisma.lead.findMany({ where: { companyId: A.companyId } }),
      contacts: await prisma.crmContact.findMany({ where: { companyId: A.companyId } }),
      deals: await prisma.deal.findMany({ where: { companyId: A.companyId } }),
      activities: await prisma.crmActivity.findMany({ where: { companyId: A.companyId } }),
    });
    for (const id of bIds) expect(aRows).not.toContain(id);
  });

  it("still accepts A's own references", async () => {
    sessionUserId = A.userId;
    const lead = await call("crm/leads", "POST", {}, { firstName: "Own", lastName: "Lead", assignedToId: A.membershipId });
    expect(lead.status).toBe(201);
    const deal = await call("crm/deals", "POST", {}, { name: "Own", value: 5, customerId: A.customerId, contactId: A.contactId });
    expect(deal.status).toBe(201);
    const moved = await call("crm/deals/[id]/move", "POST", { id: A.dealId }, { stageId: A.stageIds[1] });
    expect(moved.status).toBe(200);
    const activity = await call("crm/activities", "POST", {}, { type: "NOTE", subject: "Own", leadId: A.leadId, dealId: A.dealId });
    expect(activity.status).toBe(201);
  });

  it("maps permission and malformed-body errors to 403/400 instead of 500", async () => {
    sessionUserId = accountantUserId; // ACCOUNTANT has no CRM access
    for (const [path, method] of [["crm/leads", "GET"], ["crm/deals", "POST"], ["crm/activities", "GET"]] as const) {
      expect((await call(path, method, {}, method === "GET" ? undefined : { name: "x", value: 1 })).status).toBe(403);
    }

    sessionUserId = A.userId;
    const bad = await call("crm/leads", "POST", {}, undefined, { raw: "{not json" });
    expect(bad.status).toBe(400);
  });

  it("clamps list pagination and ignores unknown status filters", async () => {
    sessionUserId = A.userId;
    const huge = await call("crm/leads", "GET", {}, undefined, { query: "?limit=1000000&page=0" });
    expect(huge.status).toBe(200);
    expect(JSON.parse(huge.body)).toMatchObject({ page: 1, limit: 200 });
    const junk = await call("crm/activities", "GET", {}, undefined, { query: "?status=NOPE&page=abc" });
    expect(junk.status).toBe(200);
  });
});
