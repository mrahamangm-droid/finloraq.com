/**
 * Tax code management against real Postgres: create, edit while unused,
 * refuse rate/treatment edits and deletion once a posted line uses the code,
 * allow rename/deactivate, RBAC, tenant scoping, and the audit trail.
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

describe.skipIf(!enabled)("tax code management (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let tc: typeof import("@/lib/taxCodes");
  type Ctx = { companyId: string; membershipId: string; userId: string };
  let A: Ctx;
  let B: Ctx;
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  async function makeCompany(label: string): Promise<Ctx> {
    const { createCompanyForUser } = await import("@/lib/onboarding");
    const user = await prisma.user.create({
      data: { name: `TC ${label}`, email: `tc-${label}-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() },
    });
    const company = await createCompanyForUser({ userId: user.id, name: `TC ${label} ${tag}`, countryCode: "AE", baseCurrency: "AED" });
    const m = await prisma.companyMembership.findFirstOrThrow({ where: { companyId: company.id, userId: user.id } });
    return { companyId: company.id, membershipId: m.id, userId: user.id };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    tc = await import("@/lib/taxCodes");
    A = await makeCompany("a");
    B = await makeCompany("b");
  }, 60_000);

  it("creates a code and lets an unused code's rate and treatment change", async () => {
    const created = await tc.createTaxCode({ ...A, code: "vat_red_10", name: "Reduced 10%", ratePercent: "10", treatment: "STANDARD", isInput: false });
    expect(created.code).toBe("VAT_RED_10");
    expect(created.rate.toString()).toBe("0.1");

    await expect(
      tc.createTaxCode({ ...A, code: "VAT_RED_10", name: "Dup", ratePercent: "1", treatment: "STANDARD", isInput: false })
    ).rejects.toThrow(tc.TaxCodeValidationError);

    const edited = await tc.updateTaxCode({ ...A, taxCodeId: created.id, ratePercent: "12.5", treatment: "ZERO_RATED" });
    expect(edited.rate.toString()).toBe("0.125");
    expect(edited.treatment).toBe("ZERO_RATED");

    const audit = await prisma.auditEvent.findMany({ where: { companyId: A.companyId, entityId: created.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.action)).toEqual(["tax_code.created", "tax_code.updated"]);
  });

  it("refuses rate edits and deletion once a posted invoice line uses the code, but allows rename and deactivate", async () => {
    const { createCustomer } = await import("@/lib/parties");
    const { createInvoice, postInvoiceToLedger } = await import("@/lib/sales");
    const code = await tc.createTaxCode({ ...A, code: "VAT_USED", name: "Used 5%", ratePercent: "5", treatment: "STANDARD", isInput: false });
    const customer = await createCustomer({ ...A, name: `Cust ${tag}` } as never);
    const inv = await createInvoice({
      ...A, customerId: customer.id, issueDate: new Date(), dueDate: new Date(), currency: "AED",
      lines: [{ description: "Work", quantity: 1, unitPrice: 100, taxCodeId: code.id }],
    });
    await postInvoiceToLedger({ ...A, invoiceId: inv.id });

    await expect(tc.updateTaxCode({ ...A, taxCodeId: code.id, ratePercent: "6" })).rejects.toThrow(tc.TaxCodeInUseError);
    await expect(tc.updateTaxCode({ ...A, taxCodeId: code.id, treatment: "EXEMPT" })).rejects.toThrow(tc.TaxCodeInUseError);
    await expect(tc.deleteTaxCode({ ...A, taxCodeId: code.id })).rejects.toThrow(tc.TaxCodeInUseError);

    const renamed = await tc.updateTaxCode({ ...A, taxCodeId: code.id, name: "Used 5% (legacy)", isActive: false });
    expect(renamed).toMatchObject({ name: "Used 5% (legacy)", isActive: false });
    expect(renamed.rate.toString()).toBe("0.05");

    // The posted line still points at the code — nothing was nulled out.
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: inv.id } });
    expect(line.taxCodeId).toBe(code.id);
  });

  it("deletes a never-used code", async () => {
    const code = await tc.createTaxCode({ ...A, code: "VAT_TMP", name: "Temp", ratePercent: "1", treatment: "STANDARD", isInput: true });
    await tc.deleteTaxCode({ ...A, taxCodeId: code.id });
    expect(await prisma.taxCode.findUnique({ where: { id: code.id } })).toBeNull();
    expect(await prisma.auditEvent.count({ where: { entityId: code.id, action: "tax_code.deleted" } })).toBe(1);
  });

  it("never touches another company's tax codes", async () => {
    const bCode = await prisma.taxCode.findFirstOrThrow({ where: { companyId: B.companyId } });
    const { NotFoundError } = await import("@/lib/errors");
    await expect(tc.updateTaxCode({ ...A, taxCodeId: bCode.id, name: "Hijack" })).rejects.toThrow(NotFoundError);
    await expect(tc.deleteTaxCode({ ...A, taxCodeId: bCode.id })).rejects.toThrow(NotFoundError);
    expect(await prisma.taxCode.findUniqueOrThrow({ where: { id: bCode.id } })).toMatchObject({ name: bCode.name });
    const listed = await tc.listTaxCodes(A.companyId);
    expect(listed.some((r) => r.id === bCode.id)).toBe(false);
  });

  it("requires settings:EDIT (an Accountant can't change tax codes)", async () => {
    const user = await prisma.user.create({ data: { name: "Acct", email: `tc-acct-${tag}@t.local`, passwordHash: "x" } });
    const m = await prisma.companyMembership.create({ data: { companyId: A.companyId, userId: user.id, role: "ACCOUNTANT" } });
    const { ForbiddenError } = await import("@/lib/rbac");
    await expect(
      tc.createTaxCode({ companyId: A.companyId, membershipId: m.id, userId: user.id, code: "NOPE", name: "No", ratePercent: "1", treatment: "STANDARD", isInput: false })
    ).rejects.toThrow(ForbiddenError);
  });
});
