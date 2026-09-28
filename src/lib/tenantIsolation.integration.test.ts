/**
 * Cross-tenant isolation, end to end against real Postgres.
 *
 * Two companies, A and B, each with an admin. Signed in as A's admin, the
 * test calls the real route handlers under src/app/api with B's record ids
 * and B's reference ids (customers, suppliers, tax codes, projects, cost
 * centres, accounts), then checks that:
 *   - every such call is refused (never 2xx),
 *   - nothing in company B changed — every row of every tenant-scoped model,
 *     compared before and after,
 *   - nothing A created ends up pointing at B's records,
 *   - list endpoints and the active-company cookie never surface B's data.
 *
 * Only the session and request cookies are stubbed (they come from the
 * Next.js request, which doesn't exist here); tenant resolution, RBAC and
 * every query are the real code.
 *
 * Needs a migrated database, so it runs only when DATABASE_URL is set AND
 * either CI or RUN_DB_TESTS is set — so a plain `npm test` on a laptop
 * pointed at a dev database doesn't write fixture companies into it. CI's
 * database is a throwaway service container. Fixtures are left in place
 * (ledger rows can't be deleted); every run uses fresh, uniquely named ones.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

let sessionUserId: string | null = null;
const cookieJar = new Map<string, string>();

vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth")>();
  return { ...actual, getServerSession: vi.fn(async () => (sessionUserId ? { user: { id: sessionUserId } } : null)) };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const enabled = !!process.env.DATABASE_URL && !!(process.env.CI || process.env.RUN_DB_TESTS);

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Mod = Record<string, unknown>;

interface Fixture {
  userId: string;
  companyId: string;
  membershipId: string;
  customerId: string;
  supplierId: string;
  taxCodeId: string;
  accountId: string;
  draftInvoiceId: string;
  postedInvoiceId: string;
  draftBillId: string;
  postedBillId: string;
  draftExpenseId: string;
  postedExpenseId: string;
  journalId: string;
  journalNumber: string;
  bankAccountId: string;
  bankTxId: string;
  projectId: string;
  costCentreId: string;
  documentId: string;
  memberFileId: string;
}

describe.skipIf(!enabled)("tenant isolation across API routes (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let ACTIVE_COMPANY_COOKIE: string;
  let A: Fixture;
  let B: Fixture;
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  async function makeCompany(label: string): Promise<Fixture> {
    const { createCompanyForUser } = await import("@/lib/onboarding");
    const { createCustomer, createSupplier } = await import("@/lib/parties");
    const { createInvoice, postInvoiceToLedger } = await import("@/lib/sales");
    const { createBill, approveAndPostBill } = await import("@/lib/purchases");
    const { createExpense, approveExpense } = await import("@/lib/expenses");
    const { postJournalEntry } = await import("@/lib/ledger");
    const { createBankAccount, recordBankTransaction } = await import("@/lib/banking");
    const { createProject } = await import("@/lib/projects");
    const { createCostCentre } = await import("@/lib/costCentres");
    const { createAccount } = await import("@/lib/accounts");

    const user = await prisma.user.create({
      data: { name: `Iso ${label}`, email: `iso-${label.toLowerCase()}-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() },
    });
    const company = await createCompanyForUser({ userId: user.id, name: `Iso ${label} ${tag}`, countryCode: "AE", baseCurrency: "AED" });
    const m = await prisma.companyMembership.findFirstOrThrow({ where: { companyId: company.id, userId: user.id } });
    const ctx = { companyId: company.id, membershipId: m.id, userId: user.id };
    const today = new Date();
    const taxCode = await prisma.taxCode.findFirstOrThrow({ where: { companyId: company.id } });
    const customer = await createCustomer({ ...ctx, name: `Customer ${label}` } as never);
    const supplier = await createSupplier({ ...ctx, name: `Supplier ${label}` });
    const account = await createAccount({ ...ctx, code: "5190", name: `Misc ${label}`, type: "EXPENSE" } as never);
    const line = [{ description: "Work", quantity: 1, unitPrice: 100 }];
    const draftInvoice = await createInvoice({ ...ctx, customerId: customer.id, issueDate: today, dueDate: today, currency: "AED", lines: line });
    const postedInvoice = await createInvoice({ ...ctx, customerId: customer.id, issueDate: today, dueDate: today, currency: "AED", lines: line });
    await postInvoiceToLedger({ ...ctx, invoiceId: postedInvoice.id });
    const draftBill = await createBill({ ...ctx, supplierId: supplier.id, issueDate: today, dueDate: today, currency: "AED", lines: line } as never);
    const postedBill = await createBill({ ...ctx, supplierId: supplier.id, issueDate: today, dueDate: today, currency: "AED", lines: line } as never);
    await approveAndPostBill({ ...ctx, billId: postedBill.id });
    const draftExpense = (await createExpense({ ...ctx, date: today, amount: 40, description: "Taxi" })) as { id: string };
    const postedExpense = (await createExpense({ ...ctx, date: today, amount: 60, description: "Lunch" })) as { id: string };
    await approveExpense({ ...ctx, journalEntryId: postedExpense.id });
    const journal = await postJournalEntry({
      ...ctx, date: today, sourceType: "MANUAL", currency: "AED", post: true,
      lines: [{ accountCode: "1000", debit: 25 }, { accountCode: "3000", credit: 25 }],
    });
    const bank = await createBankAccount({ ...ctx, name: `Bank ${label}`, currency: "AED" });
    const bankTx = await recordBankTransaction({ ...ctx, bankAccountId: bank.id, date: today, description: "Deposit", amount: 25 });
    const project = await createProject({ ...ctx, name: `Project ${label}`, code: `P-${label}` });
    const costCentre = await createCostCentre({ ...ctx, name: `CC ${label}`, code: `CC-${label}` });
    const document = await prisma.document.create({
      data: {
        companyId: company.id, fileName: `receipt-${label}.pdf`, storageKey: `test/${tag}/${label}`, hash: `${tag}${label}`,
        mimeType: "application/pdf", sizeBytes: 10, status: "EXTRACTED", kind: "CUSTOMER_RECORD",
        extractedData: { records: [{ customerName: `Extracted ${label}` }] },
        uploadedBy: user.id,
      },
    });
    const memberFile = await prisma.memberFile.create({
      data: {
        companyId: company.id, membershipId: m.id, title: `Contract ${label}`, fileName: `contract-${label}.txt`,
        mimeType: "text/plain", sizeBytes: 6, dataUrl: `data:text/plain;base64,${Buffer.from(`SECRET${label}`).toString("base64")}`,
        uploadedBy: user.id,
      },
    });

    return {
      userId: user.id, companyId: company.id, membershipId: m.id,
      customerId: customer.id, supplierId: supplier.id, taxCodeId: taxCode.id, accountId: account.id,
      draftInvoiceId: draftInvoice.id, postedInvoiceId: postedInvoice.id,
      draftBillId: draftBill.id, postedBillId: postedBill.id,
      draftExpenseId: draftExpense.id, postedExpenseId: postedExpense.id,
      journalId: journal.id, journalNumber: journal.entryNumber,
      bankAccountId: bank.id, bankTxId: bankTx.id,
      projectId: project.id, costCentreId: costCentre.id,
      documentId: document.id, memberFileId: memberFile.id,
    };
  }

  /** Every row of every model with a companyId column, for one company, plus the child rows that hang off them. */
  async function snapshot(companyId: string): Promise<string> {
    const out: Record<string, unknown> = {};
    for (const model of Prisma.dmmf.datamodel.models) {
      if (!model.fields.some((f) => f.name === "companyId")) continue;
      const delegate = (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<unknown[]> }>)[
        model.name.charAt(0).toLowerCase() + model.name.slice(1)
      ];
      if (!delegate) throw new Error(`no Prisma delegate for ${model.name}`);
      out[model.name] = await delegate.findMany({ where: { companyId }, orderBy: { id: "asc" } });
    }
    out.JournalLine = await prisma.journalLine.findMany({ where: { journalEntry: { companyId } }, orderBy: { id: "asc" } });
    out.InvoiceLine = await prisma.invoiceLine.findMany({ where: { invoice: { companyId } }, orderBy: { id: "asc" } });
    out.BillLine = await prisma.billLine.findMany({ where: { bill: { companyId } }, orderBy: { id: "asc" } });
    out.BankTransaction = await prisma.bankTransaction.findMany({ where: { bankAccount: { companyId } }, orderBy: { id: "asc" } });
    return JSON.stringify(out);
  }

  // Static imports so the bundler can resolve every route module.
  const routes: Record<string, () => Promise<Mod>> = {
    "accounts": () => import("@/app/api/accounts/route"),
    "accounts/[id]": () => import("@/app/api/accounts/[id]/route"),
    "bank-accounts": () => import("@/app/api/bank-accounts/route"),
    "bank-accounts/[id]": () => import("@/app/api/bank-accounts/[id]/route"),
    "bank-accounts/[id]/import": () => import("@/app/api/bank-accounts/[id]/import/route"),
    "bank-accounts/[id]/reconcile": () => import("@/app/api/bank-accounts/[id]/reconcile/route"),
    "bank-accounts/[id]/transactions": () => import("@/app/api/bank-accounts/[id]/transactions/route"),
    "bank-transactions/[id]": () => import("@/app/api/bank-transactions/[id]/route"),
    "bank-transactions/[id]/match": () => import("@/app/api/bank-transactions/[id]/match/route"),
    "bills": () => import("@/app/api/bills/route"),
    "bills/[id]": () => import("@/app/api/bills/[id]/route"),
    "bills/[id]/approve": () => import("@/app/api/bills/[id]/approve/route"),
    "bills/[id]/payments": () => import("@/app/api/bills/[id]/payments/route"),
    "bills/[id]/void": () => import("@/app/api/bills/[id]/void/route"),
    "customers/intelligence/[documentId]/apply": () => import("@/app/api/customers/intelligence/[documentId]/apply/route"),
    "customers/intelligence/[documentId]/ignore": () => import("@/app/api/customers/intelligence/[documentId]/ignore/route"),
    "documents/[id]/create-expense": () => import("@/app/api/documents/[id]/create-expense/route"),
    "expenses": () => import("@/app/api/expenses/route"),
    "expenses/[id]": () => import("@/app/api/expenses/[id]/route"),
    "expenses/[id]/approve": () => import("@/app/api/expenses/[id]/approve/route"),
    "expenses/[id]/reverse": () => import("@/app/api/expenses/[id]/reverse/route"),
    "invoices": () => import("@/app/api/invoices/route"),
    "invoices/[id]": () => import("@/app/api/invoices/[id]/route"),
    "invoices/[id]/payment-link": () => import("@/app/api/invoices/[id]/payment-link/route"),
    "invoices/[id]/payments": () => import("@/app/api/invoices/[id]/payments/route"),
    "invoices/[id]/post": () => import("@/app/api/invoices/[id]/post/route"),
    "invoices/[id]/submit-einvoice": () => import("@/app/api/invoices/[id]/submit-einvoice/route"),
    "invoices/[id]/void": () => import("@/app/api/invoices/[id]/void/route"),
    "journals": () => import("@/app/api/journals/route"),
    "journals/[id]/reverse": () => import("@/app/api/journals/[id]/reverse/route"),
    "member-files/[id]": () => import("@/app/api/member-files/[id]/route"),
    "projects": () => import("@/app/api/projects/route"),
    "projects/[id]": () => import("@/app/api/projects/[id]/route"),
    "projects/[id]/archive": () => import("@/app/api/projects/[id]/archive/route"),
  };
  const route = async (path: string): Promise<Mod> => {
    const load = routes[path];
    if (!load) throw new Error(`route ${path} not in the table`);
    return load();
  };

  interface Result { status: number; body: string }

  async function call(mod: Mod, method: string, params: Record<string, string> = {}, body?: unknown): Promise<Result> {
    const handler = mod[method] as Handler | undefined;
    if (!handler) throw new Error(`no ${method} handler`);
    const req = new Request("http://localhost/api/test", {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    try {
      const res = await handler(req, { params: Promise.resolve(params) });
      return { status: res.status, body: await res.text() };
    } catch (err) {
      // An uncaught throw is a 500 in Next.js: refused, but not gracefully.
      return { status: 500, body: err instanceof Error ? err.message : String(err) };
    }
  }

  function signInAs(f: Fixture, activeCompanyCookie?: string) {
    sessionUserId = f.userId;
    cookieJar.clear();
    if (activeCompanyCookie) cookieJar.set(ACTIVE_COMPANY_COOKIE, activeCompanyCookie);
  }

  const today = () => new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ ACTIVE_COMPANY_COOKIE } = await import("@/lib/tenant"));
    const { __useMemoryRateLimitsForTests } = await import("@/lib/rateLimit");
    __useMemoryRateLimitsForTests();
    A = await makeCompany("A");
    B = await makeCompany("B");
  }, 120_000);

  afterAll(async () => {
    sessionUserId = null;
    await prisma?.$disconnect();
  });

  it("refuses every by-id route on another company's records and leaves that company untouched", async () => {
    const before = await snapshot(B.companyId);
    signInAs(A);
    const line = [{ description: "Hijack", quantity: 9, unitPrice: 999 }];

    const attempts: [string, string, Record<string, string>, unknown?][] = [
      ["invoices/[id]", "GET", { id: B.draftInvoiceId }],
      ["invoices/[id]", "PATCH", { id: B.draftInvoiceId }, { lines: line }],
      ["invoices/[id]", "DELETE", { id: B.draftInvoiceId }],
      ["invoices/[id]/post", "POST", { id: B.draftInvoiceId }],
      ["invoices/[id]/payments", "POST", { id: B.postedInvoiceId }, { amount: 50 }],
      ["invoices/[id]/payment-link", "POST", { id: B.postedInvoiceId }],
      ["invoices/[id]/submit-einvoice", "POST", { id: B.postedInvoiceId }],
      ["bills/[id]", "GET", { id: B.draftBillId }],
      ["bills/[id]", "PATCH", { id: B.draftBillId }, { lines: line }],
      ["bills/[id]", "DELETE", { id: B.draftBillId }],
      ["bills/[id]/approve", "POST", { id: B.draftBillId }],
      ["bills/[id]/payments", "POST", { id: B.postedBillId }, { amount: 50 }],
      ["expenses/[id]", "PATCH", { id: B.draftExpenseId }, { description: "Hijack", amount: 999 }],
      ["expenses/[id]", "DELETE", { id: B.draftExpenseId }],
      ["expenses/[id]/approve", "POST", { id: B.draftExpenseId }],
      ["expenses/[id]/reverse", "POST", { id: B.postedExpenseId }],
      ["journals/[id]/reverse", "POST", { id: B.journalId }],
      ["invoices/[id]/void", "POST", { id: B.postedInvoiceId }, { reason: "Cross-tenant void attempt" }],
      ["bills/[id]/void", "POST", { id: B.postedBillId }, { reason: "Cross-tenant void attempt" }],
      ["accounts/[id]", "PATCH", { id: B.accountId }, { name: "Hijack" }],
      ["accounts/[id]", "DELETE", { id: B.accountId }],
      ["bank-accounts/[id]", "PATCH", { id: B.bankAccountId }, { name: "Hijack" }],
      ["bank-accounts/[id]", "DELETE", { id: B.bankAccountId }],
      ["bank-accounts/[id]/reconcile", "POST", { id: B.bankAccountId }],
      ["bank-accounts/[id]/import", "POST", { id: B.bankAccountId }, { fileName: "s.csv", content: "Date,Description,Amount\n2026-01-05,Hijack,10\n", commit: true }],
      ["bank-accounts/[id]/transactions", "POST", { id: B.bankAccountId }, { date: today(), description: "Hijack", amount: 1 }],
      ["bank-transactions/[id]", "PATCH", { id: B.bankTxId }, { description: "Hijack" }],
      ["bank-transactions/[id]", "DELETE", { id: B.bankTxId }],
      ["bank-transactions/[id]/match", "POST", { id: B.bankTxId }, { entryNumber: B.journalNumber }],
      ["bank-transactions/[id]/match", "POST", { id: B.bankTxId }, { entryNumber: A.journalNumber }],
      ["bank-transactions/[id]/match", "DELETE", { id: B.bankTxId }],
      ["projects/[id]", "PATCH", { id: B.projectId }, { name: "Hijack" }],
      ["projects/[id]", "DELETE", { id: B.projectId }],
      ["projects/[id]/archive", "POST", { id: B.projectId }, { isActive: false }],
      ["documents/[id]/create-expense", "POST", { id: B.documentId }, { description: "Hijack", amount: 10, date: today() }],
      ["customers/intelligence/[documentId]/apply", "POST", { documentId: B.documentId }, { kind: "create", recordIndex: 0, name: "Hijack" }],
      ["customers/intelligence/[documentId]/ignore", "POST", { documentId: B.documentId }, { recordIndex: 0 }],
      ["member-files/[id]", "GET", { id: B.memberFileId }],
    ];

    const accepted: string[] = [];
    const unhandled: string[] = [];
    for (const [path, method, params, body] of attempts) {
      const res = await call(await route(path), method, params, body);
      if (res.status < 300) accepted.push(`${method} ${path} -> ${res.status}`);
      // Refused cleanly (404 not found, or 400/403), never an uncaught 500.
      if (res.status >= 500) unhandled.push(`${method} ${path} -> ${res.status}: ${res.body.slice(0, 80)}`);
      expect(res.body).not.toContain("SECRETB");
      expect(res.body).not.toContain("Customer B");
    }
    expect(accepted).toEqual([]);
    expect(unhandled).toEqual([]);
    expect(await snapshot(B.companyId)).toBe(before);
  }, 120_000);

  it("never lets a company reference another company's customers, suppliers, tax codes, projects, cost centres or accounts", async () => {
    const before = await snapshot(B.companyId);
    signInAs(A);
    const d = today();
    const attempts: [string, string, Record<string, string>, unknown][] = [
      ["invoices", "POST", {}, { customerId: B.customerId, issueDate: d, dueDate: d, currency: "AED", lines: [{ description: "x", quantity: 1, unitPrice: 10 }] }],
      ["invoices", "POST", {}, { customerId: A.customerId, issueDate: d, dueDate: d, currency: "AED", lines: [{ description: "x", quantity: 1, unitPrice: 10, taxCodeId: B.taxCodeId }] }],
      ["invoices/[id]", "PATCH", { id: A.draftInvoiceId }, { customerId: B.customerId }],
      ["invoices/[id]", "PATCH", { id: A.draftInvoiceId }, { lines: [{ description: "x", quantity: 1, unitPrice: 10, taxCodeId: B.taxCodeId }] }],
      ["bills", "POST", {}, { supplierId: B.supplierId, issueDate: d, dueDate: d, currency: "AED", lines: [{ description: "x", quantity: 1, unitPrice: 10 }] }],
      ["bills", "POST", {}, { supplierId: A.supplierId, issueDate: d, dueDate: d, currency: "AED", lines: [{ description: "x", quantity: 1, unitPrice: 10, taxCodeId: B.taxCodeId }] }],
      ["bills/[id]", "PATCH", { id: A.draftBillId }, { supplierId: B.supplierId }],
      ["bills/[id]", "PATCH", { id: A.draftBillId }, { lines: [{ description: "x", quantity: 1, unitPrice: 10, taxCodeId: B.taxCodeId }] }],
      ["projects", "POST", {}, { name: "Cross", code: `X-${tag}`, customerId: B.customerId }],
      ["projects/[id]", "PATCH", { id: A.projectId }, { customerId: B.customerId }],
      ["accounts", "POST", {}, { code: "5191", name: "Cross", type: "EXPENSE", parentId: B.accountId }],
      ["accounts/[id]", "PATCH", { id: A.accountId }, { parentId: B.accountId }],
      ["journals", "POST", {}, { date: d, currency: "AED", post: true, lines: [{ accountCode: "1000", debit: 5, costCentreId: B.costCentreId }, { accountCode: "3000", credit: 5 }] }],
      ["journals", "POST", {}, { date: d, currency: "AED", post: true, lines: [{ accountCode: "1000", debit: 5, projectId: B.projectId }, { accountCode: "3000", credit: 5 }] }],
      ["customers/intelligence/[documentId]/apply", "POST", { documentId: A.documentId }, { kind: "link", recordIndex: 0, customerId: B.customerId }],
    ];

    const accepted: string[] = [];
    for (const [path, method, params, body] of attempts) {
      const res = await call(await route(path), method, params, body);
      if (res.status < 300) accepted.push(`${method} ${path} ${JSON.stringify(body).slice(0, 80)} -> ${res.status}`);
    }

    // Whatever the responses said, nothing in A may point at B.
    const bIds = [B.customerId, B.supplierId, B.taxCodeId, B.projectId, B.costCentreId, B.accountId];
    const leaks = [
      ...(await prisma.invoice.findMany({ where: { companyId: A.companyId, customerId: { in: bIds } }, select: { id: true } })).map((r) => `invoice ${r.id}`),
      ...(await prisma.invoiceLine.findMany({ where: { invoice: { companyId: A.companyId }, taxCodeId: { in: bIds } }, select: { id: true } })).map((r) => `invoice line ${r.id}`),
      ...(await prisma.bill.findMany({ where: { companyId: A.companyId, supplierId: { in: bIds } }, select: { id: true } })).map((r) => `bill ${r.id}`),
      ...(await prisma.billLine.findMany({ where: { bill: { companyId: A.companyId }, taxCodeId: { in: bIds } }, select: { id: true } })).map((r) => `bill line ${r.id}`),
      ...(await prisma.project.findMany({ where: { companyId: A.companyId, customerId: { in: bIds } }, select: { id: true } })).map((r) => `project ${r.id}`),
      ...(await prisma.account.findMany({ where: { companyId: A.companyId, parentId: { in: bIds } }, select: { id: true } })).map((r) => `account ${r.id}`),
      ...(await prisma.journalLine.findMany({
        where: { journalEntry: { companyId: A.companyId }, OR: [{ costCentreId: { in: bIds } }, { projectId: { in: bIds } }] },
        select: { id: true },
      })).map((r) => `journal line ${r.id}`),
    ];
    const aDocument = await prisma.document.findUniqueOrThrow({ where: { id: A.documentId } });
    if (JSON.stringify(aDocument.extractedData).includes(B.customerId)) leaks.push(`document ${aDocument.id} resolution`);
    expect(leaks).toEqual([]);
    expect(accepted).toEqual([]);
    expect(await snapshot(B.companyId)).toBe(before);
  }, 120_000);

  it("list endpoints only return the caller's own company", async () => {
    signInAs(A);
    const bIds = Object.entries(B).filter(([k]) => k.endsWith("Id") && k !== "userId").map(([, v]) => v);
    for (const path of ["invoices", "bills", "expenses", "journals", "accounts", "bank-accounts"]) {
      const res = await call(await route(path), "GET");
      expect(res.status, path).toBe(200);
      for (const id of bIds) expect(res.body, `${path} leaks ${id}`).not.toContain(id);
    }
  }, 60_000);

  it("ignores an active-company cookie naming a company the user doesn't belong to", async () => {
    signInAs(A, B.companyId);
    const { getTenantContext } = await import("@/lib/tenant");
    // getTenantContext is wrapped in React's cache(); outside a request that is a no-op, so this reads fresh.
    const ctx = await getTenantContext();
    expect(ctx?.active?.companyId).toBe(A.companyId);
    const res = await call(await route("invoices/[id]"), "GET", { id: B.postedInvoiceId });
    expect(res.status).toBe(404);
    const list = await call(await route("invoices"), "GET");
    expect(list.body).not.toContain(B.postedInvoiceId);
  });

  it("ignores a companyId smuggled into a request body", async () => {
    signInAs(A);
    const d = today();
    const res = await call(await route("invoices"), "POST", {}, {
      companyId: B.companyId, customerId: A.customerId, issueDate: d, dueDate: d, currency: "AED",
      lines: [{ description: "Body companyId", quantity: 1, unitPrice: 10 }],
    });
    expect(res.status).toBe(200);
    const created = await prisma.invoice.findUniqueOrThrow({ where: { id: (JSON.parse(res.body) as { id: string }).id } });
    expect(created.companyId).toBe(A.companyId);
  });

  it("refuses a signed-in user with no membership in any company", async () => {
    const loner = await prisma.user.create({ data: { name: "Loner", email: `iso-loner-${tag}@t.local`, passwordHash: "x" } });
    sessionUserId = loner.id;
    cookieJar.clear();
    cookieJar.set(ACTIVE_COMPANY_COOKIE, B.companyId);
    for (const [path, params] of [["invoices", {}], ["invoices/[id]", { id: B.postedInvoiceId }], ["member-files/[id]", { id: B.memberFileId }]] as const) {
      const res = await call(await route(path), "GET", params);
      expect(res.status, path).toBeGreaterThanOrEqual(400);
      expect(res.body).not.toContain("SECRETB");
    }
  });
});
