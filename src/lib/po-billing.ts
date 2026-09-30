import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { InvalidLineError } from "@/lib/ledger";

/**
 * Bookkeeping that ties Bills back to the Purchase Order lines they were
 * raised from. Lives apart from src/lib/purchase-orders.ts because
 * purchase-orders.ts imports createBill from purchases.ts, and purchases.ts
 * / voidDocuments.ts need these helpers too — keeping them here avoids a
 * circular import.
 */

type Db = typeof prisma | Prisma.TransactionClient;

type POStatus = "DRAFT" | "SENT" | "ACKNOWLEDGED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "BILLED" | "CANCELLED";

/**
 * Derives a PO's status from its lines' received/billed quantities. Only
 * ever moves the PO between the fulfilment statuses — a DRAFT/SENT/
 * ACKNOWLEDGED PO with nothing received or billed keeps whatever the user
 * set, and CANCELLED is never overridden.
 */
export function derivePOStatus(
  current: POStatus,
  lines: { quantity: unknown; receivedQuantity: unknown; billedQuantity: unknown; product?: { trackInventory: boolean } | null }[]
): POStatus {
  if (current === "CANCELLED") return current;
  const n = (v: unknown) => Number(v);
  const fullyBilled = lines.length > 0 && lines.every((l) => n(l.billedQuantity) >= n(l.quantity));
  if (fullyBilled) return "BILLED";
  // "Received" is judged on the stock lines — a freight or service line has
  // nothing to physically receive. A PO with no stock lines at all counts
  // every line.
  const stockLines = lines.filter((l) => l.product?.trackInventory);
  const receivable = stockLines.length > 0 ? stockLines : lines;
  const fullyReceived = receivable.length > 0 && receivable.every((l) => n(l.receivedQuantity) >= n(l.quantity));
  if (fullyReceived) return "RECEIVED";
  const anyReceived = lines.some((l) => n(l.receivedQuantity) > 0);
  if (anyReceived) return "PARTIALLY_RECEIVED";
  // Nothing received: a PO that was only (partially) billed for non-stock
  // lines falls back to ACKNOWLEDGED if it had been advanced past DRAFT/SENT.
  if (current === "BILLED" || current === "RECEIVED" || current === "PARTIALLY_RECEIVED") return "ACKNOWLEDGED";
  return current;
}

export async function refreshPOStatus(db: Db, poId: string): Promise<void> {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: { include: { product: { select: { trackInventory: true } } } } } });
  if (!po) return;
  const next = derivePOStatus(po.status as POStatus, po.lines);
  if (next !== po.status) {
    await db.purchaseOrder.update({ where: { id: poId }, data: { status: next } });
  }
}

/**
 * Hands a bill's PO-linked quantities back to their PO lines so they can be
 * billed again — called when a draft bill is deleted or a posted bill is
 * voided. No-op for a bill that wasn't raised from a PO.
 *
 * Must run in the same transaction as the caller's conditional status change
 * (DRAFT -> deleted, posted -> VOID), so a bill's quantities are released at
 * most once even when two deletes/voids race.
 */
export async function releasePOBilledQuantities(tx: Prisma.TransactionClient, companyId: string, billId: string): Promise<void> {
  const lines = await tx.billLine.findMany({
    where: { billId, bill: { companyId }, purchaseOrderLineId: { not: null } },
    select: { quantity: true, purchaseOrderLineId: true, purchaseOrderLine: { select: { poId: true } } },
  });
  if (lines.length === 0) return;
  const poIds = new Set<string>();
  for (const l of lines) {
    // Never below zero: a line can only give back what it actually billed.
    const res = await tx.purchaseOrderLine.updateMany({
      where: { id: l.purchaseOrderLineId!, billedQuantity: { gte: l.quantity } },
      data: { billedQuantity: { decrement: l.quantity } },
    });
    if (res.count !== 1) throw new InvalidLineError("This bill's purchase order quantities were already released — refresh and try again.");
    if (l.purchaseOrderLine) poIds.add(l.purchaseOrderLine.poId);
  }
  for (const poId of poIds) {
    await tx.purchaseOrder.updateMany({ where: { id: poId, billId }, data: { billId: null } });
    await refreshPOStatus(tx, poId);
  }
}
