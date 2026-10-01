/**
 * Opening balances against real Postgres: posts one balanced ADJUSTMENT
 * entry through the ledger, refuses a second live one (also under a
 * concurrent double-submit), allows a redo after reversal, requires an
 * acknowledgement once other activity exists, and never writes anything on
 * an unbalanced or unauthorized attempt.
 *
 * Runs only when DATABASE_URL and CI or RUN_DB_TESTS are set (same gate as
 * tenantIsolation.integration.test.ts).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const enabled = !!process.env.DATABASE_URL && !!(process.env.CI || process.env.RUN_DB_TESTS);

describe.skipIf(!enabled)("opening balances (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let ob: typeof import("@/lib/openingBalances");
  let ledger: typeof import("@/lib/ledger");
  type Ctx = { companyId: string; membershipId: string; userId: string };
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let n = 0;

  async function makeCompany(): Promise<Ctx> {
    const { createCompanyForUser } = await import("@/lib/onboarding");
    const label = `ob${++n}`;
    const user = await prisma.user.create({
      data: { name: `OB ${label}`, email: `${label}-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() },
    });
    const company = await createCompanyForUser({ userId: user.id, name: `OB ${label} ${tag}`, countryCode: "AE", baseCurrency: "AED" });
    const m = await prisma.companyMembership.findFirstOrThrow({ where: { companyId: company.id, userId: user.id } });
    return { companyId: company.id, membershipId: m.id, userId: user.id };
  }

  const tb = [
    { accountCode: "1000", debit: "15000.25" },
    { accountCode: "3000", credit: "15000.25" },
  ];
  const asOf = new Date("2025-12-31T00:00:00.000Z");

  async function balances(companyId: string) {
    const lines = await prisma.journalLine.findMany({
      where: { journalEntry: { companyId, status: "POSTED" } },
      include: { account: { select: { code: true } } },
    });
    const out: Record<string, string> = {};
    for (const l of lines) {
      const prev = new Prisma.Decimal(out[l.account.code] ?? 0);
      out[l.account.code] = prev.plus(l.debit).minus(l.credit).toFixed(2);
    }
    return out;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    ob = await import("@/lib/openingBalances");
    ledger = await import("@/lib/ledger");
  });

  it("posts one balanced ADJUSTMENT entry through the ledger and audits it", async () => {
    const ctx = await makeCompany();
    expect((await ob.openingBalanceStatus(ctx.companyId)).otherPostedCount).toBe(0);
    const entry = await ob.postOpeningBalances({ ...ctx, date: asOf, lines: tb });
    const row = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id }, include: { lines: true } });
    expect(row).toMatchObject({ status: "POSTED", sourceType: "ADJUSTMENT", sourceId: "opening-balance", currency: "AED" });
    expect(row.lines).toHaveLength(2);
    expect(await balances(ctx.companyId)).toMatchObject({ "1000": "15000.25", "3000": "-15000.25" });
    expect(await prisma.auditEvent.count({ where: { entityId: entry.id, action: "opening_balance.posted" } })).toBe(1);
    expect((await ob.openingBalanceStatus(ctx.companyId)).live?.id).toBe(entry.id);

    await expect(ob.postOpeningBalances({ ...ctx, date: asOf, lines: tb })).rejects.toThrow(ob.OpeningBalanceError);
  });

  it("lets only one of two concurrent submits post", async () => {
    const ctx = await makeCompany();
    const results = await Promise.allSettled([
      ob.postOpeningBalances({ ...ctx, date: asOf, lines: tb }),
      ob.postOpeningBalances({ ...ctx, date: asOf, lines: tb }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(ob.OpeningBalanceError);
    expect(await prisma.journalEntry.count({ where: { companyId: ctx.companyId, sourceType: "ADJUSTMENT" } })).toBe(1);
  });

  it("allows a corrected redo after the original is reversed", async () => {
    const ctx = await makeCompany();
    const first = await ob.postOpeningBalances({ ...ctx, date: asOf, lines: tb });
    await ledger.reverseJournalEntry({ ...ctx, journalEntryId: first.id });
    const status = await ob.openingBalanceStatus(ctx.companyId);
    expect(status.live).toBeNull();
    expect(status.otherPostedCount).toBe(0); // its own reversal isn't "other activity"
    const second = await ob.postOpeningBalances({
      ...ctx, date: asOf,
      lines: [{ accountCode: "1000", debit: "100.00" }, { accountCode: "3000", credit: "100.00" }],
    });
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: second.id } })).sourceId).toBe("opening-balance:2");
    expect(await balances(ctx.companyId)).toMatchObject({ "1000": "100.00", "3000": "-100.00" });
  });

  it("requires an acknowledgement once other posted activity exists", async () => {
    const ctx = await makeCompany();
    await ledger.postJournalEntry({
      ...ctx, date: new Date(), sourceType: "MANUAL", currency: "AED", post: true,
      lines: [{ accountCode: "1000", debit: 5 }, { accountCode: "3000", credit: 5 }],
    });
    await expect(ob.postOpeningBalances({ ...ctx, date: asOf, lines: tb })).rejects.toThrow(ob.OpeningBalanceActivityError);
    expect(await prisma.journalEntry.count({ where: { companyId: ctx.companyId, sourceType: "ADJUSTMENT" } })).toBe(0);
    await ob.postOpeningBalances({ ...ctx, date: asOf, lines: tb, acknowledgeExistingActivity: true });
    expect(await prisma.journalEntry.count({ where: { companyId: ctx.companyId, sourceType: "ADJUSTMENT" } })).toBe(1);
  });

  it("writes nothing for an unbalanced set or a member who can't approve journals", async () => {
    const ctx = await makeCompany();
    await expect(
      ob.postOpeningBalances({ ...ctx, date: asOf, lines: [{ accountCode: "1000", debit: "10.00" }, { accountCode: "3000", credit: "9.99" }] })
    ).rejects.toThrow(ledger.UnbalancedEntryError);

    const user = await prisma.user.create({ data: { name: "Acct", email: `ob-acct-${tag}@t.local`, passwordHash: "x" } });
    const m = await prisma.companyMembership.create({ data: { companyId: ctx.companyId, userId: user.id, role: "ACCOUNTANT" } });
    await expect(
      ob.postOpeningBalances({ companyId: ctx.companyId, membershipId: m.id, userId: user.id, date: asOf, lines: tb })
    ).rejects.toThrow(/APPROVE/);
    expect(await prisma.journalEntry.count({ where: { companyId: ctx.companyId } })).toBe(0);
  });
});
