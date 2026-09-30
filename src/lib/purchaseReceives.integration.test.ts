/**
 * Purchase Order -> Purchase Receive -> Bill, end to end against real
 * Postgres: quantities, stock + FIFO layers, and every journal entry the
 * chain posts (Inventory/GRNI at receive, GRNI clearing + price variance at
 * bill approval, reversal on void) — including that each entry balances and
 * GRNI nets to exactly "received but not yet billed".
 *
 * Runs only when DATABASE_URL and CI or RUN_DB_TESTS are set (same gate as
 * tenantIsolation.integration.test.ts); fixtures are uniquely named and left
 * in place, since posted ledger rows can't be deleted.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const enabled = !!process.env.DATABASE_URL && !!(process.env.CI || process.env.RUN_DB_TESTS);

describe.skipIf(!enabled)("purchase receives (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let po: typeof import("@/lib/purchase-orders");
  let purchases: typeof import("@/lib/purchases");
  let ctx: { companyId: string; membershipId: string; userId: string };
  let supplierId: string;
  let productId: string;
  let vatId: string;
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  async function makeCompany(label: string) {
    const { createCompanyForUser } = await import("@/lib/onboarding");
    const { createSupplier } = await import("@/lib/parties");
    const user = await prisma.user.create({
      data: { name: `PR ${label}`, email: `pr-${label}-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() },
    });
    const company = await createCompanyForUser({ userId: user.id, name: `PR ${label} ${tag}`, countryCode: "AE", baseCurrency: "AED" });
    const m = await prisma.companyMembership.findFirstOrThrow({ where: { companyId: company.id, userId: user.id } });
    const c = { companyId: company.id, membershipId: m.id, userId: user.id };
    const supplier = await createSupplier({ ...c, name: `Supplier ${label}` });
    return { ctx: c, supplierId: supplier.id };
  }

  /** Signed balance (debit - credit) of every posted line on `code`. */
  async function balance(code: string): Promise<number> {
    const lines = await prisma.journalLine.findMany({
      where: { journalEntry: { companyId: ctx.companyId, status: { in: ["POSTED", "REVERSED"] } }, account: { code } },
      select: { debit: true, credit: true },
    });
    return Math.round(lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0) * 100) / 100;
  }

  async function purposeCode(purpose: "INVENTORY_ASSET" | "GOODS_RECEIVED_NOT_INVOICED" | "COGS_EXPENSE" | "ACCOUNTS_PAYABLE") {
    return (await prisma.account.findFirstOrThrow({ where: { companyId: ctx.companyId, purpose } })).code;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    po = await import("@/lib/purchase-orders");
    purchases = await import("@/lib/purchases");
    ({ ctx, supplierId } = await makeCompany("a"));
    const product = await prisma.product.create({
      data: { companyId: ctx.companyId, name: `Widget ${tag}`, unitPrice: 25, currency: "EUR", trackInventory: true },
    });
    productId = product.id;
    vatId = (await prisma.taxCode.findFirstOrThrow({ where: { companyId: ctx.companyId, rate: 0.05 } })).id;
  });

  it("runs the full receive -> bill -> void chain with a balanced ledger", async () => {
    const order = await po.createPurchaseOrder({
      ...ctx, supplierId, issueDate: new Date(), currency: "EUR", exchangeRate: 4,
      lines: [
        { description: "Widgets", quantity: 10, unitPrice: 25, taxCodeId: vatId, productId },
        { description: "Freight", quantity: 1, unitPrice: 100, taxCodeId: vatId },
      ],
    });
    const [stockLine, serviceLine] = [...order.lines].sort((a, b) => a.description.localeCompare(b.description)).reverse();
    expect(stockLine!.description).toBe("Widgets");

    // A draft PO can't receive, and status can't be forced to RECEIVED.
    await expect(po.createPurchaseReceive({ ...ctx, poId: order.id, receiveDate: new Date(), lines: [{ purchaseOrderLineId: stockLine!.id, quantity: 1 }] }))
      .rejects.toThrow(/Send or acknowledge/);
    await expect(po.updatePurchaseOrderStatus(ctx.companyId, ctx.membershipId, ctx.userId, order.id, "RECEIVED")).rejects.toThrow(/purchase receive/);
    await po.updatePurchaseOrderStatus(ctx.companyId, ctx.membershipId, ctx.userId, order.id, "SENT");

    // Before anything is received only the non-stock line is billable.
    const full = await po.getPurchaseOrder(ctx.companyId, ctx.membershipId, order.id);
    const billable = Object.fromEntries(full.lines.map((l) => [l.description, po.billableQuantity(l).toNumber()]));
    expect(billable).toEqual({ Widgets: 0, Freight: 1 });

    // Receive 4 of 10 widgets: DR Inventory 400 / CR GRNI 400 (4 x 25 EUR x 4).
    const r1 = await po.createPurchaseReceive({ ...ctx, poId: order.id, receiveDate: new Date(), lines: [{ purchaseOrderLineId: stockLine!.id, quantity: 4 }] });
    expect(r1.purchaseOrder.status).toBe("PARTIALLY_RECEIVED");
    const [inv, grni] = [await purposeCode("INVENTORY_ASSET"), await purposeCode("GOODS_RECEIVED_NOT_INVOICED")];
    expect(await balance(inv)).toBe(400);
    expect(await balance(grni)).toBe(-400);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(Number(product.quantityOnHand)).toBe(4);
    const layer = await prisma.stockMovement.findFirstOrThrow({ where: { companyId: ctx.companyId, referenceId: r1.receive.id } });
    expect(Number(layer.unitCost)).toBe(100);

    // Over-receiving is refused.
    await expect(po.createPurchaseReceive({ ...ctx, poId: order.id, receiveDate: new Date(), lines: [{ purchaseOrderLineId: stockLine!.id, quantity: 7 }] }))
      .rejects.toThrow(/only 6 remain/);

    // Bill what's billable: 4 widgets + freight, in EUR at the PO's rate.
    const bill1 = await po.convertPOToBill({ ...ctx, poId: order.id, dueDate: new Date() });
    expect(bill1.currency).toBe("EUR");
    expect(Number(bill1.exchangeRate)).toBe(4);
    const bill1Lines = await prisma.billLine.findMany({ where: { billId: bill1.id } });
    expect(bill1Lines.map((l) => [l.description, Number(l.quantity)]).sort()).toEqual([["Freight", 1], ["Widgets", 4]]);
    await expect(po.convertPOToBill({ ...ctx, poId: order.id, dueDate: new Date() })).rejects.toThrow(/record a purchase receive/);

    // The supplier actually charged 26/unit: correct the price on the draft
    // (quantities are locked), and a quantity change is refused.
    const editLines = bill1Lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: l.description === "Widgets" ? 26 : Number(l.unitPrice), taxCodeId: l.taxCodeId ?? undefined, productId: l.productId ?? undefined }));
    await expect(purchases.updateBill({ ...ctx, billId: bill1.id, lines: editLines.map((l) => ({ ...l, quantity: l.quantity + 1 })) }))
      .rejects.toThrow(/raised from a purchase order/);
    await purchases.updateBill({ ...ctx, billId: bill1.id, lines: [...editLines].reverse() });

    await purchases.approveAndPostBill({ ...ctx, billId: bill1.id });
    // GRNI cleared at the received cost (400); price variance 4 x 1 x 4 = 16
    // to COGS; freight 400 to expense; VAT 5% of 204 EUR = 10.20 EUR = 40.80.
    expect(await balance(grni)).toBe(0);
    expect(await balance(await purposeCode("COGS_EXPENSE"))).toBe(16);
    expect(await balance(inv)).toBe(400); // not capitalized a second time
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: ctx.companyId, sourceType: "BILL", sourceId: bill1.id }, include: { lines: true } });
    const ap = entry.lines.find((l) => Number(l.credit) > 0)!;
    expect(Number(ap.credit)).toBe(856.8);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).quantityOnHand)).toBe(4);

    // Receive the other 6, bill them, then delete that draft: quantities go back.
    await po.createPurchaseReceive({ ...ctx, poId: order.id, receiveDate: new Date(), lines: [{ purchaseOrderLineId: stockLine!.id, quantity: 6 }] });
    expect(await balance(grni)).toBe(-600);
    // Two converts at once (a double-click): exactly one bills the 6 units.
    const converts = await Promise.allSettled([
      po.convertPOToBill({ ...ctx, poId: order.id, dueDate: new Date() }),
      po.convertPOToBill({ ...ctx, poId: order.id, dueDate: new Date() }),
    ]);
    expect(converts.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    const bill2 = (converts.find((c) => c.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof po.convertPOToBill>>>).value;
    const afterConvert = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true } });
    expect(Number(afterConvert.lines.find((l) => l.id === stockLine!.id)!.billedQuantity)).toBe(10);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("BILLED");
    // Two deletes at once: only one releases the 6 units.
    const deletes = await Promise.allSettled([
      purchases.deleteBill({ ...ctx, billId: bill2.id }),
      purchases.deleteBill({ ...ctx, billId: bill2.id }),
    ]);
    expect(deletes.filter((d) => d.status === "fulfilled")).toHaveLength(1);
    const afterDelete = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true } });
    expect(afterDelete.status).toBe("RECEIVED");
    expect(Number(afterDelete.lines.find((l) => l.id === stockLine!.id)!.billedQuantity)).toBe(4);

    // Voiding the posted bill re-opens GRNI for its 4 units and releases them.
    const { voidBill } = await import("@/lib/voidDocuments");
    // Two voids at once: they share one reversal and only one releases.
    const voids = await Promise.allSettled([
      voidBill({ ...ctx, billId: bill1.id, reason: "Test void" }),
      voidBill({ ...ctx, billId: bill1.id, reason: "Test void" }),
    ]);
    expect(voids.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(await balance(grni)).toBe(-1000); // all 10 received, none billed
    const afterVoid = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true } });
    expect(afterVoid.lines.every((l) => Number(l.billedQuantity) === 0)).toBe(true);
    expect(serviceLine!.id).toBeTruthy();

    // Every entry this company posted balances to the cent.
    const entries = await prisma.journalEntry.findMany({ where: { companyId: ctx.companyId }, include: { lines: true } });
    for (const e of entries) {
      const d = e.lines.reduce((s, l) => s + Number(l.debit), 0);
      const c = e.lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(Math.round(d * 100)).toBe(Math.round(c * 100));
    }
  });

  it("refuses another company's purchase order and product", async () => {
    const other = await makeCompany("b");
    const order = await po.createPurchaseOrder({
      ...ctx, supplierId, issueDate: new Date(), currency: "AED",
      lines: [{ description: "Widgets", quantity: 1, unitPrice: 10, productId }],
    });
    await po.updatePurchaseOrderStatus(ctx.companyId, ctx.membershipId, ctx.userId, order.id, "SENT");
    await expect(po.createPurchaseReceive({ ...other.ctx, poId: order.id, receiveDate: new Date(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, quantity: 1 }] }))
      .rejects.toThrow(/not found/);
    await expect(po.convertPOToBill({ ...other.ctx, poId: order.id, dueDate: new Date() })).rejects.toThrow(/not found/);
    await expect(po.createPurchaseOrder({
      ...other.ctx, supplierId: other.supplierId, issueDate: new Date(), currency: "AED",
      lines: [{ description: "Stolen", quantity: 1, unitPrice: 1, productId }],
    })).rejects.toThrow("Product not found.");
    await expect(po.createPurchaseOrder({
      ...other.ctx, supplierId, issueDate: new Date(), currency: "AED",
      lines: [{ description: "x", quantity: 1, unitPrice: 1 }],
    })).rejects.toThrow("Supplier not found.");
  });
});
