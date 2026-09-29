/**
 * Sales Orders + Shipments: the workflow stage between a Quote/direct order
 * and an Invoice (Quote -> Sales Order -> Shipment -> Invoice -> Payment).
 *
 * Cost of goods sold is recognized at SHIPMENT time, not invoice time —
 * the moment tracked-inventory goods physically leave the warehouse is
 * when COGS is real, whether or not the customer has been billed yet
 * (same convention Zoho Books uses). createShipment() below posts its own
 * DR Cost of Goods Sold / CR Inventory Asset journal entry using the same
 * FIFO cost engine as a direct invoice (src/lib/inventory.ts). An invoice
 * later raised from this order (createInvoiceFromSalesOrder) sets
 * Invoice.salesOrderId, which tells postInvoiceToLedger() in
 * src/lib/sales.ts to post Revenue/AR/Tax only — never COGS again.
 *
 * Scope of this module: base-currency sales orders only (multi-currency
 * orders are a separate follow-up, same boundary purchases.ts/expenses.ts
 * already draw). No UI yet — this is the backend/lib layer; a follow-up
 * pass wires up list/detail/new pages the same way sales.ts's did.
 */
import type Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { shipStock, previewFifoCost } from "@/lib/inventory";
import { postJournalEntry, InvalidLineError, assertBaseCurrency, normalizeCurrencyCode } from "@/lib/ledger";
import { money } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import { foreignReferenceProblem } from "@/lib/tenantRefs";
import { getOrCreateCogsExpenseCode, getOrCreateInventoryAssetCode } from "@/lib/accounts";
import { createInvoice, type InvoiceLineInput } from "@/lib/sales";

export interface SalesOrderLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
  productId?: string;
}

/** Draft only — no ledger or stock impact until a Shipment is recorded. */
export async function createSalesOrder(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  customerId: string;
  issueDate: Date;
  currency: string;
  lines: SalesOrderLineInput[];
}) {
  await requirePermission(params.membershipId, "sales_orders", "CREATE");
  await assertBaseCurrency(prisma, params.companyId, params.currency);

  if (params.lines.length === 0) {
    throw new InvalidLineError("A sales order needs at least one line.");
  }
  const customerProblem = await foreignReferenceProblem(prisma, params.companyId, "customer", [params.customerId]);
  if (customerProblem) throw new InvalidLineError(customerProblem);

  const { lines: computedLines, subtotal, taxTotal, total } = await computeTaxedLines(prisma, params.companyId, params.lines);

  const order = await prisma.$transaction(async (tx: any) => {
    const orderNumber = await nextDocumentNumber(tx, params.companyId, "SO", () =>
      tx.salesOrder.findFirst({ where: { companyId: params.companyId }, orderBy: { orderNumber: "desc" }, select: { orderNumber: true } }).then((r: any) => (r ? { number: r.orderNumber } : null))
    );

    return tx.salesOrder.create({
      data: {
        companyId: params.companyId,
        customerId: params.customerId,
        orderNumber,
        issueDate: params.issueDate,
        currency: normalizeCurrencyCode(params.currency),
        subtotal,
        taxTotal,
        total,
        status: "DRAFT",
        lines: {
          create: computedLines.map((l) => ({
            description: l.line.description,
            quantity: l.line.quantity,
            unitPrice: l.line.unitPrice,
            taxCodeId: l.line.taxCodeId,
            lineTotal: l.lineTotal,
            ...(l.line.productId ? { productId: l.line.productId } : {}),
          })),
        },
      },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "sales_order.created",
    entityType: "SalesOrder",
    entityId: order.id,
    newValue: { orderNumber: order.orderNumber, total: total.toFixed(2) },
  });

  return order;
}

/** Draft -> Confirmed: commits to the order so it can be shipped. No
 *  ledger impact — nothing financial happens until a Shipment posts COGS,
 *  or an invoice raised from this order posts revenue. */
export async function confirmSalesOrder(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  salesOrderId: string;
}) {
  await requirePermission(params.membershipId, "sales_orders", "EDIT");

  const order = await prisma.salesOrder.findFirst({ where: { id: params.salesOrderId, companyId: params.companyId } });
  if (!order) throw new NotFoundError("Sales order not found.");
  if (order.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft sales order can be confirmed.");
  }

  const updated = await prisma.salesOrder.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "sales_order.confirmed",
    entityType: "SalesOrder",
    entityId: order.id,
  });

  return updated;
}

/**
 * Records goods physically shipped against a confirmed order — supports
 * partial shipments, so this can be called more than once per order until
 * every line is fully shipped. For each tracked-inventory line, this:
 *  1. Fails fast (before anything is written) if physical stock is short —
 *     same "never recognize a cost you can't back with real inventory"
 *     rule postInvoiceToLedger enforces for a direct invoice.
 *  2. Posts one combined DR Cost of Goods Sold / CR Inventory Asset journal
 *     entry (sourceType SHIPMENT, keyed to this Shipment's id — so it can
 *     never double-post if retried).
 *  3. Physically consumes the same FIFO layers via shipStock(), best-effort
 *     (logged, not fatal) exactly like the direct-invoice path — the
 *     journal entry above is already committed and immutable by then.
 */
export async function createShipment(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  salesOrderId: string;
  shipDate: Date;
  notes?: string;
  lines: { salesOrderLineId: string; quantity: number }[];
}) {
  await requirePermission(params.membershipId, "sales_orders", "EDIT");

  const order = await prisma.salesOrder.findFirst({
    where: { id: params.salesOrderId, companyId: params.companyId },
    include: { lines: { include: { product: { select: { id: true, name: true, trackInventory: true, quantityOnHand: true, expenseAccountCode: true } } } } },
  });
  if (!order) throw new NotFoundError("Sales order not found.");
  if (!["CONFIRMED", "PARTIALLY_SHIPPED"].includes(order.status)) {
    throw new InvalidLineError("Only a confirmed (or partially shipped) sales order can receive a shipment.");
  }
  if (params.lines.length === 0) {
    throw new InvalidLineError("A shipment needs at least one line.");
  }

  const orderLineById = new Map(order.lines.map((l: any) => [l.id, l]));
  const cogsGroups = new Map<string, Decimal>();
  let inventoryAssetCode: string | undefined;
  const shipLines: { line: any; quantity: number }[] = [];

  for (const input of params.lines) {
    const line = orderLineById.get(input.salesOrderLineId);
    if (!line) throw new InvalidLineError("Sales order line not found on this order.");
    if (input.quantity <= 0) throw new InvalidLineError("Shipment quantity must be positive.");
    const remaining = Number(line.quantity) - Number(line.shippedQuantity);
    if (input.quantity > remaining) {
      throw new InvalidLineError(
        `Can't ship ${input.quantity} of "${line.description}" — only ${remaining} remain unshipped on this order.`
      );
    }
    shipLines.push({ line, quantity: input.quantity });
  }

  const trackedShipLines = shipLines.filter((s) => s.line.product?.trackInventory);
  if (trackedShipLines.length > 0) {
    const [defaultCogsCode, resolvedInventoryAssetCode] = await Promise.all([
      getOrCreateCogsExpenseCode(params.companyId),
      getOrCreateInventoryAssetCode(params.companyId),
    ]);
    inventoryAssetCode = resolvedInventoryAssetCode;
    for (const { line, quantity } of trackedShipLines) {
      const available = Number(line.product.quantityOnHand);
      if (available < quantity) {
        throw new InvalidLineError(
          `Not enough stock of "${line.product.name}" to ship — available ${available}, need ${quantity}. Adjust stock or the shipment quantity first.`
        );
      }
      const { totalCost } = await previewFifoCost(params.companyId, line.product.id, quantity);
      const code = line.product.expenseAccountCode ?? defaultCogsCode;
      cogsGroups.set(code, (cogsGroups.get(code) ?? money(0)).plus(totalCost));
    }
  }

  const shipment = await prisma.$transaction(async (tx: any) => {
    const shipmentNumber = await nextDocumentNumber(tx, params.companyId, "SHP", () =>
      tx.shipment.findFirst({ where: { companyId: params.companyId }, orderBy: { shipmentNumber: "desc" }, select: { shipmentNumber: true } }).then((r: any) => (r ? { number: r.shipmentNumber } : null))
    );

    const created = await tx.shipment.create({
      data: {
        companyId: params.companyId,
        salesOrderId: order.id,
        shipmentNumber,
        shipDate: params.shipDate,
        notes: params.notes,
        createdBy: params.userId,
        lines: {
          create: shipLines.map(({ line, quantity }) => ({ salesOrderLineId: line.id, quantity })),
        },
      },
    });

    for (const { line, quantity } of shipLines) {
      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { shippedQuantity: Number(line.shippedQuantity) + quantity },
      });
    }

    return created;
  });

  const cogsLines = [...cogsGroups.entries()].map(([accountCode, amount]) => ({ accountCode, amount }));
  const cogsTotal = cogsLines.reduce((s, l) => s.plus(l.amount), money(0));
  if (!cogsTotal.isZero()) {
    if (!inventoryAssetCode) throw new InvalidLineError("Inventory asset account required when cost-of-goods-sold lines are given.");
    await postJournalEntry({
      companyId: params.companyId,
      membershipId: params.membershipId,
      userId: params.userId,
      date: params.shipDate,
      sourceType: "SHIPMENT",
      sourceId: shipment.id,
      memo: `Shipment ${shipment.shipmentNumber} — Sales Order ${order.orderNumber}`,
      currency: order.currency,
      lines: [
        ...cogsLines.map((l) => ({ accountCode: l.accountCode, debit: l.amount, description: "Cost of Goods Sold" })),
        { accountCode: inventoryAssetCode, credit: cogsTotal, description: "Inventory Asset" },
      ],
      post: true,
    });
  }

  const refreshedLines = await prisma.salesOrderLine.findMany({ where: { salesOrderId: order.id } });
  const fullyShipped = refreshedLines.every((l: any) => Number(l.shippedQuantity) >= Number(l.quantity));
  const updatedOrder = await prisma.salesOrder.update({
    where: { id: order.id },
    data: { status: fullyShipped ? "SHIPPED" : "PARTIALLY_SHIPPED" },
  });

  // Physically consume stock for the tracked lines this shipment covers —
  // best-effort, same resilience posture as postInvoiceToLedger's own
  // shipStock loop: the journal entry above is already committed.
  for (const { line, quantity } of trackedShipLines) {
    try {
      await shipStock(params.companyId, params.userId, line.product.id, quantity, {
        notes: `Shipment ${shipment.shipmentNumber}`,
        referenceType: "Shipment",
        referenceId: shipment.id,
        date: params.shipDate,
      });
    } catch (err: any) {
      console.error(`[inventory] shipStock failed for shipment ${shipment.id} product ${line.product.id}: ${err?.message}`);
    }
  }

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "sales_order.shipped",
    entityType: "Shipment",
    entityId: shipment.id,
    newValue: { shipmentNumber: shipment.shipmentNumber, salesOrderId: order.id, cogsTotal: cogsTotal.toFixed(2) },
  });

  return { shipment, salesOrder: updatedOrder };
}

/**
 * Raises a DRAFT invoice for every line's shipped-but-not-yet-invoiced
 * quantity on this order (all of it — there's no partial line-selection
 * in this pass, matching this module's UI-less scope). The invoice is
 * created with Invoice.salesOrderId set, so postInvoiceToLedger() (in
 * src/lib/sales.ts) posts Revenue/AR/Tax only — COGS already posted at
 * Shipment time above. Post it the same way any other draft invoice is
 * posted (a separate postInvoiceToLedger call), not automatically here.
 */
export async function createInvoiceFromSalesOrder(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  salesOrderId: string;
  dueDate: Date;
}) {
  await requirePermission(params.membershipId, "sales_orders", "EDIT");

  const order = await prisma.salesOrder.findFirst({
    where: { id: params.salesOrderId, companyId: params.companyId },
    include: { lines: true },
  });
  if (!order) throw new NotFoundError("Sales order not found.");

  const invoiceableLines = order.lines.filter((l: any) => Number(l.shippedQuantity) - Number(l.invoicedQuantity) > 0);
  if (invoiceableLines.length === 0) {
    throw new InvalidLineError("Nothing on this order has shipped but not yet been invoiced.");
  }

  const lines: (InvoiceLineInput & { salesOrderLineId: string; quantity: number })[] = invoiceableLines.map((l: any) => ({
    description: l.description,
    quantity: Number(l.shippedQuantity) - Number(l.invoicedQuantity),
    unitPrice: Number(l.unitPrice),
    taxCodeId: l.taxCodeId ?? undefined,
    productId: l.productId ?? undefined,
    salesOrderLineId: l.id,
  }));

  const invoice = await createInvoice({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    customerId: order.customerId,
    issueDate: new Date(),
    dueDate: params.dueDate,
    currency: order.currency,
    lines,
    salesOrderId: order.id,
  });

  await prisma.$transaction(
    lines.map((l) =>
      prisma.salesOrderLine.update({
        where: { id: l.salesOrderLineId },
        data: { invoicedQuantity: { increment: l.quantity } },
      })
    )
  );

  const refreshedLines = await prisma.salesOrderLine.findMany({ where: { salesOrderId: order.id } });
  const fullyInvoiced = refreshedLines.every((l: any) => Number(l.invoicedQuantity) >= Number(l.quantity));
  if (fullyInvoiced) {
    await prisma.salesOrder.update({ where: { id: order.id }, data: { status: "INVOICED" } });
  }

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "sales_order.invoiced",
    entityType: "Invoice",
    entityId: invoice.id,
    newValue: { salesOrderId: order.id, invoiceNumber: invoice.invoiceNumber },
  });

  return invoice;
}
