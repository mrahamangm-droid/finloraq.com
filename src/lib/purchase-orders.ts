import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { can, requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { money, roundMoney } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import { createBill } from "@/lib/purchases";
import { InvalidLineError, postJournalEntry, resolveDocumentCurrency } from "@/lib/ledger";
import { foreignReferenceProblem } from "@/lib/tenantRefs";
import { getOrCreateGrniCode, getOrCreateInventoryAssetCode } from "@/lib/accounts";
import { receiveStock } from "@/lib/inventory";
import { refreshPOStatus } from "@/lib/po-billing";

/**
 * Purchase Orders -> Purchase Receives -> Bills.
 *
 * Mirrors Sales Order -> Shipment -> Invoice (src/lib/sales-orders.ts):
 *
 *  - A PurchaseReceive records goods arriving against one or more PO lines
 *    (partial receipts allowed, never more than was ordered). For a line
 *    whose product tracks inventory it posts, in base currency,
 *        DR Inventory Asset / CR Goods Received Not Invoiced (GRNI)
 *    at unitPrice x the PO's exchange rate, and opens the FIFO cost layer
 *    (receiveStock) at that same unit cost.
 *  - convertPOToBill raises a DRAFT bill for everything billable and not yet
 *    billed: a tracked line up to what has been received, any other line up
 *    to what was ordered. Each bill line carries purchaseOrderLineId, so
 *    approveAndPostBill (purchases.ts) clears GRNI for a tracked line instead
 *    of capitalizing it again, and books any bill-vs-PO price or FX
 *    difference as a purchase price variance.
 */

export interface POLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
  productId?: string;
}

type POStatus = "DRAFT" | "SENT" | "ACKNOWLEDGED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "BILLED" | "CANCELLED";

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listPurchaseOrders(companyId: string, membershipId: string) {
  await requirePermission(membershipId, "purchase_orders", "VIEW");
  return prisma.purchaseOrder.findMany({
    where: { companyId },
    orderBy: { issueDate: "desc" },
    include: { supplier: true },
    take: 200,
  });
}

// ─── Get single ──────────────────────────────────────────────────────────────

export async function getPurchaseOrder(companyId: string, membershipId: string, id: string) {
  await requirePermission(membershipId, "purchase_orders", "VIEW");
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      supplier: true,
      project: true,
      bill: true,
      lines: { include: { taxCode: true, product: { select: { id: true, name: true, trackInventory: true } } } },
      receives: { include: { lines: true }, orderBy: { receiveDate: "asc" } },
    },
  });
  if (!po) throw new NotFoundError("Purchase order not found");
  return po;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createPurchaseOrder(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  supplierId: string;
  projectId?: string;
  issueDate: Date;
  expectedDate?: Date;
  currency: string;
  /** 1 unit of `currency` in base currency. Required for a foreign-currency
   *  PO; must be 1 or omitted for a base-currency one. */
  exchangeRate?: number;
  notes?: string;
  lines: POLineInput[];
}) {
  await requirePermission(params.membershipId, "purchase_orders", "CREATE");

  if (params.lines.length === 0) throw new InvalidLineError("A purchase order needs at least one line.");
  for (const l of params.lines) {
    if (!(l.quantity > 0)) throw new InvalidLineError("Every purchase order line needs a positive quantity.");
    if (!(l.unitPrice >= 0)) throw new InvalidLineError("A purchase order line's unit price can't be negative.");
  }

  const supplierProblem = await foreignReferenceProblem(prisma, params.companyId, "supplier", [params.supplierId]);
  if (supplierProblem) throw new InvalidLineError(supplierProblem);
  const projectProblem = await foreignReferenceProblem(prisma, params.companyId, "project", [params.projectId]);
  if (projectProblem) throw new InvalidLineError(projectProblem);

  const { currency, exchangeRate } = await resolveDocumentCurrency(prisma, params.companyId, params.currency, params.exchangeRate);
  const { lines: computed, subtotal, taxTotal, total } = await computeTaxedLines(prisma, params.companyId, params.lines);

  const po = await prisma.$transaction(async (tx: any) => {
    const poNumber = await nextDocumentNumber(tx, params.companyId, "PO", () =>
      tx.purchaseOrder
        .findFirst({ where: { companyId: params.companyId }, orderBy: { poNumber: "desc" }, select: { poNumber: true } })
        .then((r: any) => (r ? { number: r.poNumber } : null))
    );

    return tx.purchaseOrder.create({
      data: {
        companyId: params.companyId,
        supplierId: params.supplierId,
        projectId: params.projectId || undefined,
        poNumber,
        issueDate: params.issueDate,
        expectedDate: params.expectedDate,
        currency,
        exchangeRate,
        subtotal,
        taxTotal,
        total,
        notes: params.notes,
        status: "DRAFT",
        lines: {
          create: computed.map((l) => ({
            description: l.line.description,
            quantity: l.line.quantity,
            unitPrice: l.line.unitPrice,
            taxCodeId: l.line.taxCodeId || undefined,
            productId: l.line.productId || undefined,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "purchase_order.created",
    entityType: "PurchaseOrder",
    entityId: po.id,
    newValue: { poNumber: po.poNumber, total: po.total.toString(), currency, exchangeRate: exchangeRate.toString() },
  });

  return po;
}

// ─── Update status ────────────────────────────────────────────────────────────

/** The statuses a user may set by hand. Receipt and billing statuses are
 *  derived from actual receives/bills (see refreshPOStatus), never set. */
const MANUAL_STATUSES: POStatus[] = ["SENT", "ACKNOWLEDGED", "CANCELLED"];

export async function updatePurchaseOrderStatus(
  companyId: string,
  membershipId: string,
  userId: string,
  id: string,
  status: POStatus
) {
  await requirePermission(membershipId, "purchase_orders", "EDIT");

  if (!MANUAL_STATUSES.includes(status)) {
    throw new InvalidLineError(
      status === "RECEIVED" || status === "PARTIALLY_RECEIVED"
        ? "Record a purchase receive to mark goods as received."
        : status === "BILLED"
          ? "Convert the purchase order to a bill to mark it billed."
          : "That status can't be set by hand."
    );
  }

  const po = await prisma.purchaseOrder.findFirst({ where: { id, companyId }, include: { lines: true } });
  if (!po) throw new NotFoundError("Purchase order not found");
  if (po.status === "CANCELLED") throw new InvalidLineError("A cancelled purchase order can't be changed.");
  const anyReceived = po.lines.some((l: any) => Number(l.receivedQuantity) > 0);
  const anyBilled = po.lines.some((l: any) => Number(l.billedQuantity) > 0);
  if (anyReceived || anyBilled) {
    throw new InvalidLineError("Goods have already been received or billed on this purchase order, so its status now follows its receives and bills.");
  }

  const updated = await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status } });

  await recordAuditEvent({
    companyId,
    userId,
    action: "purchase_order.status_changed",
    entityType: "PurchaseOrder",
    entityId: id,
    previousValue: { status: po.status },
    newValue: { status },
  });

  return updated;
}

// ─── Purchase receive ────────────────────────────────────────────────────────

export async function createPurchaseReceive(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  poId: string;
  receiveDate: Date;
  notes?: string;
  lines: { purchaseOrderLineId: string; quantity: number }[];
}) {
  await requirePermission(params.membershipId, "purchase_orders", "EDIT");

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: params.poId, companyId: params.companyId },
    include: { lines: { include: { product: { select: { id: true, name: true, trackInventory: true } } } } },
  });
  if (!po) throw new NotFoundError("Purchase order not found");
  if (po.status === "DRAFT") throw new InvalidLineError("Send or acknowledge the purchase order before receiving goods against it.");
  if (po.status === "CANCELLED") throw new InvalidLineError("A cancelled purchase order can't receive goods.");
  if (params.lines.length === 0) throw new InvalidLineError("A purchase receive needs at least one line.");

  const lineById = new Map(po.lines.map((l: any) => [l.id, l]));
  const seen = new Set<string>();
  const receiveLines: { line: any; quantity: number; unitCost: Decimal }[] = [];
  for (const input of params.lines) {
    const line = lineById.get(input.purchaseOrderLineId);
    if (!line) throw new InvalidLineError("Purchase order line not found on this purchase order.");
    if (seen.has(line.id)) throw new InvalidLineError("Each purchase order line can appear only once per receive.");
    seen.add(line.id);
    if (!(input.quantity > 0)) throw new InvalidLineError("Receive quantity must be positive.");
    const remaining = money(line.quantity).minus(line.receivedQuantity);
    if (money(input.quantity).greaterThan(remaining)) {
      throw new InvalidLineError(`Can't receive ${input.quantity} of "${line.description}" — only ${remaining.toString()} remain outstanding on this order.`);
    }
    receiveLines.push({ line, quantity: input.quantity, unitCost: roundMoney(money(line.unitPrice).times(po.exchangeRate)) });
  }

  const tracked = receiveLines.filter((r) => r.line.product?.trackInventory);
  if (tracked.length > 0 && !(await can(params.membershipId, "journals", "APPROVE"))) {
    // Checked up front so nothing is written when the ledger posting below
    // would be refused.
    throw new InvalidLineError("Receiving tracked stock posts to the ledger, which requires the APPROVE permission on Journals.");
  }
  const [inventoryAssetCode, grniCode] = tracked.length > 0
    ? await Promise.all([getOrCreateInventoryAssetCode(params.companyId), getOrCreateGrniCode(params.companyId)])
    : [undefined, undefined];

  const receive = await prisma.$transaction(async (tx: any) => {
    const receiveNumber = await nextDocumentNumber(tx, params.companyId, "PR", () =>
      tx.purchaseReceive
        .findFirst({ where: { companyId: params.companyId }, orderBy: { receiveNumber: "desc" }, select: { receiveNumber: true } })
        .then((r: any) => (r ? { number: r.receiveNumber } : null))
    );
    const created = await tx.purchaseReceive.create({
      data: {
        companyId: params.companyId,
        poId: po.id,
        receiveNumber,
        receiveDate: params.receiveDate,
        notes: params.notes,
        createdBy: params.userId,
        lines: {
          create: receiveLines.map((r) => ({ purchaseOrderLineId: r.line.id, quantity: r.quantity, unitCost: r.unitCost })),
        },
      },
    });
    for (const r of receiveLines) {
      // Conditional increment: re-checks the outstanding quantity inside the
      // transaction so two concurrent receives can't over-receive a line.
      const res = await tx.purchaseOrderLine.updateMany({
        where: { id: r.line.id, receivedQuantity: { lte: money(r.line.quantity).minus(r.quantity).toNumber() } },
        data: { receivedQuantity: { increment: r.quantity } },
      });
      if (res.count !== 1) throw new InvalidLineError(`"${r.line.description}" was received by someone else in the meantime — refresh and try again.`);
    }
    await refreshPOStatus(tx, po.id);
    return created;
  });

  const receivedValue = tracked.reduce((s, r) => s.plus(roundMoney(r.unitCost.times(r.quantity))), money(0));
  let journalEntryId: string | undefined;
  if (receivedValue.greaterThan(0)) {
    try {
      const entry = await postJournalEntry({
        companyId: params.companyId,
        membershipId: params.membershipId,
        userId: params.userId,
        date: params.receiveDate,
        sourceType: "PURCHASE_RECEIVE",
        sourceId: receive.id,
        memo: `Purchase receive ${receive.receiveNumber} — ${po.poNumber}`,
        currency: po.currency,
        exchangeRate: po.exchangeRate,
        lines: [
          { accountCode: inventoryAssetCode!, debit: receivedValue, description: "Inventory Asset", projectId: po.projectId ?? undefined },
          { accountCode: grniCode!, credit: receivedValue, description: "Goods Received Not Invoiced", projectId: po.projectId ?? undefined },
        ],
        post: true,
      });
      journalEntryId = entry.id;
    } catch (err) {
      // Roll the receive back so quantities never run ahead of the ledger
      // (e.g. a locked period refused the posting).
      await prisma.$transaction(async (tx: any) => {
        for (const r of receiveLines) {
          await tx.purchaseOrderLine.update({ where: { id: r.line.id }, data: { receivedQuantity: { decrement: r.quantity } } });
        }
        await tx.purchaseReceive.delete({ where: { id: receive.id } });
        await refreshPOStatus(tx, po.id);
      });
      throw err;
    }
  }

  // Physical stock + FIFO layer, at the same base-currency unit cost the
  // entry above capitalized. Best-effort after the (immutable) posting,
  // same resilience posture as bill approval / shipments.
  for (const r of tracked) {
    try {
      await receiveStock(params.companyId, params.userId, r.line.product.id, r.quantity, {
        unitCost: r.unitCost.toNumber(),
        notes: `Purchase receive ${receive.receiveNumber} (${po.poNumber})`,
        referenceType: "PurchaseReceive",
        referenceId: receive.id,
        date: params.receiveDate,
      });
    } catch (err: any) {
      console.error(`[inventory] receiveStock failed for purchase receive ${receive.id} product ${r.line.product.id}: ${err?.message}`);
    }
  }

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "purchase_order.received",
    entityType: "PurchaseReceive",
    entityId: receive.id,
    newValue: {
      receiveNumber: receive.receiveNumber,
      poId: po.id,
      lines: receiveLines.map((r) => ({ purchaseOrderLineId: r.line.id, quantity: r.quantity })),
      inventoryValue: receivedValue.toFixed(2),
      journalEntryId,
    },
  });

  const updatedPO = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
  return { receive, purchaseOrder: updatedPO };
}

// ─── Convert PO → Bill ────────────────────────────────────────────────────────

/** How much of a PO line can still be billed: a tracked-stock line only up
 *  to what has been received (three-way match), anything else up to what was
 *  ordered. */
export function billableQuantity(line: { quantity: unknown; receivedQuantity: unknown; billedQuantity: unknown; product?: { trackInventory: boolean } | null }): Decimal {
  const ceiling = line.product?.trackInventory ? money(line.receivedQuantity as Decimal.Value) : money(line.quantity as Decimal.Value);
  const left = ceiling.minus(line.billedQuantity as Decimal.Value);
  return left.greaterThan(0) ? left : money(0);
}

export async function convertPOToBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  poId: string;
  dueDate: Date;
  issueDate?: Date;
}) {
  await requirePermission(params.membershipId, "purchase_orders", "EDIT");
  await requirePermission(params.membershipId, "bills", "CREATE");

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: params.poId, companyId: params.companyId },
    include: { lines: { include: { product: { select: { trackInventory: true } } } } },
  });
  if (!po) throw new NotFoundError("Purchase order not found");
  if (po.status === "DRAFT") throw new InvalidLineError("Send or acknowledge the purchase order before billing it.");
  if (po.status === "CANCELLED") throw new InvalidLineError("A cancelled purchase order can't be billed.");

  const billable = po.lines
    .map((l: any) => ({ line: l, qty: billableQuantity(l) }))
    .filter((b: { qty: Decimal }) => b.qty.greaterThan(0));
  if (billable.length === 0) {
    const waitingOnReceipt = po.lines.some((l: any) => l.product?.trackInventory && money(l.quantity).greaterThan(l.receivedQuantity));
    throw new InvalidLineError(
      waitingOnReceipt
        ? "Nothing on this purchase order is ready to bill — record a purchase receive for the stock items first."
        : "Everything on this purchase order has already been billed."
    );
  }

  // Reserve the quantities before creating the bill. Each increment is
  // conditional on the line still being where this snapshot saw it (billed
  // no further, and for stock nothing un-received since), so two concurrent
  // converts can't both bill the same goods — the loser aborts here.
  await prisma.$transaction(async (tx: any) => {
    for (const { line, qty } of billable as { line: any; qty: Decimal }[]) {
      const ceiling = line.product?.trackInventory ? money(line.receivedQuantity) : money(line.quantity);
      const res = await tx.purchaseOrderLine.updateMany({
        where: {
          id: line.id,
          billedQuantity: { lte: ceiling.minus(qty).toNumber() },
          ...(line.product?.trackInventory ? { receivedQuantity: { gte: money(line.receivedQuantity).toNumber() } } : {}),
        },
        data: { billedQuantity: { increment: qty.toNumber() } },
      });
      if (res.count !== 1) throw new InvalidLineError(`"${line.description}" was billed by someone else in the meantime — refresh and try again.`);
    }
  });

  let bill: Awaited<ReturnType<typeof createBill>>;
  try {
    bill = await createBill({
      companyId: params.companyId,
      membershipId: params.membershipId,
      userId: params.userId,
      supplierId: po.supplierId,
      issueDate: params.issueDate ?? new Date(),
      dueDate: params.dueDate,
      currency: po.currency,
      exchangeRate: Number(po.exchangeRate),
      lines: billable.map(({ line, qty }: { line: any; qty: Decimal }) => ({
        description: line.description,
        quantity: qty.toNumber(),
        unitPrice: Number(line.unitPrice),
        taxCodeId: line.taxCodeId ?? undefined,
        productId: line.productId ?? undefined,
        purchaseOrderLineId: line.id,
      })),
    });
  } catch (err) {
    // Release the reservation so a refused bill leaves the PO as it was.
    await prisma.$transaction(async (tx: any) => {
      for (const { line, qty } of billable as { line: any; qty: Decimal }[]) {
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { billedQuantity: { decrement: qty.toNumber() } } });
      }
    });
    throw err;
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { billId: bill.id } });
    await refreshPOStatus(tx, po.id);
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "purchase_order.converted_to_bill",
    entityType: "PurchaseOrder",
    entityId: params.poId,
    newValue: { billId: bill.id, billNumber: bill.billNumber, lines: billable.length },
  });

  return bill;
}

// ─── Delete (draft only) ──────────────────────────────────────────────────────

export async function deletePurchaseOrder(companyId: string, membershipId: string, userId: string, id: string) {
  await requirePermission(membershipId, "purchase_orders", "DELETE");

  const po = await prisma.purchaseOrder.findFirst({ where: { id, companyId } });
  if (!po) throw new NotFoundError("Purchase order not found");
  if (po.status !== "DRAFT") throw new InvalidLineError("Only draft POs can be deleted.");

  await prisma.purchaseOrder.delete({ where: { id: po.id } });

  await recordAuditEvent({
    companyId,
    userId,
    action: "purchase_order.deleted",
    entityType: "PurchaseOrder",
    entityId: id,
    previousValue: { poNumber: po.poNumber },
  });
}
