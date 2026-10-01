/**
 * Full company export against real Postgres: the archive holds every core
 * table for the caller's company and nothing from any other company, money
 * is exact, the export is audit-logged, and it needs settings:EXPORT.
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

describe.skipIf(!enabled)("company data export (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  type Co = { companyId: string; membershipId: string; userId: string; customerId: string; invoiceId: string; bankTxId: string };
  let A: Co;
  let B: Co;
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  async function makeCompany(label: string): Promise<Co> {
    const { createCompanyForUser } = await import("@/lib/onboarding");
    const { createCustomer } = await import("@/lib/parties");
    const { createInvoice, postInvoiceToLedger } = await import("@/lib/sales");
    const { createBankAccount, recordBankTransaction } = await import("@/lib/banking");
    const user = await prisma.user.create({
      data: { name: `EX ${label}`, email: `ex-${label}-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() },
    });
    const company = await createCompanyForUser({ userId: user.id, name: `Export ${label} ${tag}`, countryCode: "AE", baseCurrency: "AED" });
    const m = await prisma.companyMembership.findFirstOrThrow({ where: { companyId: company.id, userId: user.id } });
    const ctx = { companyId: company.id, membershipId: m.id, userId: user.id };
    const customer = await createCustomer({ ...ctx, name: `Customer ${label} ${tag}` } as never);
    const vat = await prisma.taxCode.findFirstOrThrow({ where: { companyId: company.id, rate: 0.05 } });
    const inv = await createInvoice({
      ...ctx, customerId: customer.id, issueDate: new Date(), dueDate: new Date(), currency: "AED",
      lines: [{ description: `Consulting, "phase 1"`, quantity: 3, unitPrice: 333.33, taxCodeId: vat.id }],
    });
    await postInvoiceToLedger({ ...ctx, invoiceId: inv.id });
    const bank = await createBankAccount({ ...ctx, name: `Bank ${label}`, currency: "AED" });
    const tx = await recordBankTransaction({ ...ctx, bankAccountId: bank.id, date: new Date(), description: "Deposit", amount: 12.34 });
    return { ...ctx, customerId: customer.id, invoiceId: inv.id, bankTxId: tx.id };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    A = await makeCompany("A");
    B = await makeCompany("B");
  }, 60_000);

  it("exports only the caller's company, with exact amounts, and audits it", async () => {
    const { exportCompanyData } = await import("@/lib/dataExport");
    const { readZip } = await import("@/lib/zipTestReader");
    const { zip } = await exportCompanyData({ companyId: A.companyId, membershipId: A.membershipId, userId: A.userId });
    const files = readZip(zip);

    expect([...files.keys()]).toEqual([
      "README.txt", "accounts.csv", "journal_entries.csv", "journal_lines.csv", "invoices.csv", "invoice_lines.csv",
      "bills.csv", "bill_lines.csv", "customers.csv", "suppliers.csv", "tax_codes.csv", "bank_accounts.csv", "bank_transactions.csv",
    ]);

    const all = [...files.values()].join("\n");
    for (const id of [B.companyId, B.customerId, B.invoiceId, B.bankTxId]) expect(all).not.toContain(id);
    expect(all).not.toContain(`Customer B ${tag}`);

    expect(files.get("customers.csv")).toContain(`Customer A ${tag}`);
    expect(files.get("invoices.csv")).toContain(A.invoiceId);
    expect(files.get("bank_transactions.csv")).toContain(A.bankTxId);

    // 3 x 333.33 = 999.99 subtotal; exact decimals, not floats.
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: A.invoiceId } });
    expect(files.get("invoices.csv")).toContain(inv.total.toFixed());
    expect(files.get("invoice_lines.csv")).toContain('"Consulting, ""phase 1"""');
    expect(files.get("bank_transactions.csv")).toContain("12.34");

    // Every journal line in the file belongs to one of A's entries, and the ledger balances.
    const { parseCsv } = await import("@/lib/files/csv");
    const lines = parseCsv(files.get("journal_lines.csv")!, ",").filter((r) => r.length > 1);
    const header = lines[0]!;
    const iDebit = header.indexOf("debit");
    const iCredit = header.indexOf("credit");
    let net = 0n;
    for (const cells of lines.slice(1)) {
      net += BigInt(Math.round(Number(cells[iDebit]) * 100)) - BigInt(Math.round(Number(cells[iCredit]) * 100));
    }
    expect(lines.length).toBeGreaterThan(1);
    expect(net).toBe(0n);

    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { companyId: A.companyId, action: "company.data_exported" } });
    expect(audit.userId).toBe(A.userId);
    expect((audit.newValue as { files: Record<string, number> }).files["invoices.csv"]).toBe(1);
  });

  it("requires settings:EXPORT", async () => {
    const { exportCompanyData } = await import("@/lib/dataExport");
    const { ForbiddenError } = await import("@/lib/rbac");
    const user = await prisma.user.create({ data: { name: "Acct", email: `ex-acct-${tag}@t.local`, passwordHash: "x" } });
    const m = await prisma.companyMembership.create({ data: { companyId: A.companyId, userId: user.id, role: "ACCOUNTANT" } });
    await expect(exportCompanyData({ companyId: A.companyId, membershipId: m.id, userId: user.id })).rejects.toThrow(ForbiddenError);
  });
});
