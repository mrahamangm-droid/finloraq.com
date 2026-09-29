/**
 * Inventory / Stock Movement tracking
 *
 * All changes to Product.quantityOnHand are recorded as StockMovement entries.
 * The running balance (quantityOnHand) is updated atomically with each movement
 * using a Prisma $transaction to prevent race conditions and ensure consistency.
 *
 * Double-entry safety: COGS journal entries are written by src/lib/ledger.ts
 * via the invoicing/billing flows. This module only manages the physical
 * quantity ledger (StockMovement) and the denormalised balance field.
 *
 * Immutability: posted StockMovements are never deleted or updated.
 * Corrections are made as new ADJUSTMENT entries (positive or negative).
 */

import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { money, roundMoney } from "@/lib/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockMovementType =
  | "RECEIPT"
  | "SHIPMENT"
  | "ADJUSTMENT"
  | "OPENING"
  | "RETURN_IN"
  | "RETURN_OUT";

/** Movement types that create a FIFO cost layer (costLayerRemaining is
 *  seeded to the movement's quantity and consumed by later outbound
 *  movements — see consumeFifoLayers()/previewFifoCost() below). */
const INBOUND_LAYER_TYPES: StockMovementType[] = ["RECEIPT", "OPENING", "RETURN_IN"];

export interface StockMovementRow {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;   // positive = in, negative = out
  balanceAfter: number;
  unitCost: number | null;
  notes: string | null;
  referenceType: string | null;
  referenceId: string | null;
  date: Date;
  createdAt: Date;
  createdBy: string;
}

export interface ProductStockSummary {
  productId: string;
  productName: string;
  sku: string | null;
  quantityOnHand: number;
  reorderPoint: number | null;
  belowReorder: boolean;
  unit: string | null;
}

// ─── Query helpers ─────────────────────────────────────────────────────────────

export async function listStockMovements(
  companyId: string,
  productId: string,
  opts?: { limit?: number; offset?: number }
): Promise<StockMovementRow[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { companyId, productId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: opts?.limit ?? 100,
    skip: opts?.offset ?? 0,
  });

  type Row = (typeof rows)[number];
  return rows.map((r: Row): StockMovementRow => ({
    id: r.id,
    productId: r.productId,
    type: r.type as StockMovementType,
    quantity: r.quantity.toNumber(),
    balanceAfter: r.balanceAfter.toNumber(),
    unitCost: r.unitCost?.toNumber() ?? null,
    notes: r.notes,
    referenceType: r.referenceType,
    referenceId: r.referenceId,
    date: r.date,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
  }));
}

export async function listLowStockProducts(companyId: string): Promise<ProductStockSummary[]> {
  const products = await prisma.product.findMany({
    where: {
      companyId,
      trackInventory: true,
      isActive: true,
      reorderPoint: { not: null },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      quantityOnHand: true,
      reorderPoint: true,
      unit: true,
    },
    orderBy: { name: "asc" },
  });

  type PRow = (typeof products)[number];
  return products.map((p: PRow): ProductStockSummary => {
    const qty = p.quantityOnHand.toNumber();
    const reorder = p.reorderPoint?.toNumber() ?? null;
    return {
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      quantityOnHand: qty,
      reorderPoint: reorder,
      belowReorder: reorder !== null && qty <= reorder,
      unit: p.unit,
    };
  });
}

export async function getStockSummary(companyId: string, productId: string): Promise<ProductStockSummary | null> {
  const p = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true, name: true, sku: true, quantityOnHand: true, reorderPoint: true, unit: true },
  });
  if (!p) return null;
  const qty = p.quantityOnHand.toNumber();
  const reorder = p.reorderPoint?.toNumber() ?? null;
  return {
    productId: p.id,
    productName: p.name,
    sku: p.sku,
    quantityOnHand: qty,
    reorderPoint: reorder,
    belowReorder: reorder !== null && qty <= reorder,
    unit: p.unit,
  };
}

// ─── Core movement writer ─────────────────────────────────────────────────────
// Internal: called by RECEIPT, SHIPMENT, ADJUSTMENT etc.

async function recordMovement(
  companyId: string,
  data: {
    productId: string;
    type: StockMovementType;
    quantity: number; // signed: positive = in, negative = out
    unitCost?: number | null;
    notes?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    date: Date;
    createdBy: string; // userId
  }
): Promise<{ movement: StockMovementRow; newQuantity: number }> {
  // Verify product belongs to company and tracks inventory
  const product = await prisma.product.findFirst({
    where: { id: data.productId, companyId },
    select: { id: true, name: true, quantityOnHand: true, trackInventory: true },
  });
  if (!product) throw new Error("Product not found.");
  if (!product.trackInventory) {
    throw new Error(`Product "${product.name}" does not have inventory tracking enabled.`);
  }

  const currentQty = product.quantityOnHand.toNumber();
  const newQty = currentQty + data.quantity;

  // Prevent negative stock on SHIPMENT (not for adjustments/write-offs)
  if (data.type === "SHIPMENT" && newQty < 0) {
    throw new Error(
      `Insufficient stock for "${product.name}". Available: ${currentQty}, requested: ${Math.abs(data.quantity)}.`
    );
  }

  // Atomically update balance + create movement record. An inbound type
  // (RECEIPT, OPENING, RETURN_IN) opens a new FIFO cost layer, fully
  // unconsumed at creation — see consumeFifoLayers() below, which decrements
  // costLayerRemaining as later shipments draw from it oldest-first.
  const isInboundLayer = INBOUND_LAYER_TYPES.includes(data.type);
  const [movement] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        companyId,
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        balanceAfter: newQty,
        unitCost: data.unitCost ?? null,
        costLayerRemaining: isInboundLayer ? data.quantity : null,
        notes: data.notes ?? null,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
        date: data.date,
        createdBy: data.createdBy,
      },
    }),
    prisma.product.update({
      where: { id: data.productId },
      data: { quantityOnHand: newQty },
    }),
  ]);

  return {
    movement: {
      id: movement.id,
      productId: movement.productId,
      type: movement.type as StockMovementType,
      quantity: movement.quantity.toNumber(),
      balanceAfter: movement.balanceAfter.toNumber(),
      unitCost: movement.unitCost?.toNumber() ?? null,
      notes: movement.notes,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      date: movement.date,
      createdAt: movement.createdAt,
      createdBy: movement.createdBy,
    },
    newQuantity: newQty,
  };
}

// ─── Public mutations ─────────────────────────────────────────────────────────

/** Manual stock adjustment (positive or negative quantity). */
export async function adjustStock(
  companyId: string,
  membershipId: string,
  userId: string,
  productId: string,
  adjustment: number, // signed
  opts?: { notes?: string; date?: Date; unitCost?: number }
): Promise<{ newQuantity: number }> {
  await requirePermission(membershipId, "inventory", "EDIT");
  if (adjustment === 0) throw new Error("Adjustment quantity cannot be zero.");

  const { newQuantity } = await recordMovement(companyId, {
    productId,
    type: "ADJUSTMENT",
    quantity: adjustment,
    notes: opts?.notes ?? null,
    unitCost: opts?.unitCost ?? null,
    date: opts?.date ?? new Date(),
    createdBy: userId,
  });

  await recordAuditEvent({
    companyId,
    userId,
    action: "inventory.stock_adjusted",
    entityType: "StockMovement",
    entityId: productId,
    newValue: { adjustment, newQuantity, notes: opts?.notes },
  });

  return { newQuantity };
}

/** Set opening stock balance (first time only, or explicit override). */
export async function setOpeningStock(
  companyId: string,
  membershipId: string,
  userId: string,
  productId: string,
  quantity: number,
  opts?: { unitCost?: number; date?: Date; notes?: string }
): Promise<{ newQuantity: number }> {
  await requirePermission(membershipId, "inventory", "EDIT");
  if (quantity < 0) throw new Error("Opening stock quantity cannot be negative.");

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { quantityOnHand: true },
  });
  if (!product) throw new Error("Product not found.");

  // The adjustment needed to reach the target opening quantity
  const current = product.quantityOnHand.toNumber();
  const adjustment = quantity - current;

  const { newQuantity } = await recordMovement(companyId, {
    productId,
    type: "OPENING",
    quantity: adjustment,
    notes: opts?.notes ?? "Opening stock",
    unitCost: opts?.unitCost ?? null,
    date: opts?.date ?? new Date(),
    createdBy: userId,
  });

  await recordAuditEvent({
    companyId,
    userId,
    action: "inventory.opening_stock_set",
    entityType: "Product",
    entityId: productId,
    newValue: { quantity, newQuantity, unitCost: opts?.unitCost },
  });

  return { newQuantity };
}

/**
 * Record a goods receipt (e.g. from a Bill).
 * Called by the purchase/bill workflow when items are received.
 */
export async function receiveStock(
  companyId: string,
  userId: string,
  productId: string,
  quantity: number, // must be positive
  opts?: {
    unitCost?: number;
    referenceType?: string;
    referenceId?: string;
    date?: Date;
    notes?: string;
  }
): Promise<{ newQuantity: number }> {
  if (quantity <= 0) throw new Error("Receipt quantity must be positive.");

  const { newQuantity } = await recordMovement(companyId, {
    productId,
    type: "RECEIPT",
    quantity,
    unitCost: opts?.unitCost ?? null,
    referenceType: opts?.referenceType ?? null,
    referenceId: opts?.referenceId ?? null,
    notes: opts?.notes ?? null,
    date: opts?.date ?? new Date(),
    createdBy: userId,
  });

  return { newQuantity };
}

/**
 * Looks up the most recent unit cost this product was received at (any
 * inbound layer, spent or not). Used as a fallback valuation when a
 * shipment needs to consume more than the FIFO layers on record cover —
 * see consumeOrPreviewFifoCost() below.
 */
async function lastKnownUnitCost(companyId: string, productId: string): Promise<Decimal> {
  const last = await prisma.stockMovement.findFirst({
    where: { companyId, productId, type: { in: INBOUND_LAYER_TYPES }, unitCost: { not: null } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { unitCost: true },
  });
  return money(last?.unitCost ?? 0);
}

/**
 * The core FIFO engine: consumes `quantity` units from this product's
 * oldest available cost layers first (RECEIPT/OPENING/RETURN_IN movements
 * with costLayerRemaining > 0, oldest date/createdAt first), returning the
 * total and weighted-average unit cost of what was consumed. When
 * `commit` is a Prisma transaction client, each layer's costLayerRemaining
 * is actually decremented; when omitted, this only reads — a dry run used
 * to compute the COGS journal lines *before* posting (see
 * previewFifoCost() and postInvoiceToLedger in src/lib/sales.ts).
 *
 * If the available layers don't cover the full quantity (e.g. stock
 * received before this feature existed, or a manual adjustment that never
 * recorded a cost), the shortfall is valued at lastKnownUnitCost() rather
 * than zero, so COGS is never silently understated — but no layer is
 * created or consumed for that shortfall, since there's no real layer to
 * draw down.
 */
async function consumeOrPreviewFifoCost(
  companyId: string,
  productId: string,
  quantity: number,
  commit?: Prisma.TransactionClient
): Promise<{ totalCost: Decimal; unitCost: Decimal }> {
  if (quantity <= 0) return { totalCost: money(0), unitCost: money(0) };

  const db = commit ?? prisma;
  const layers = await db.stockMovement.findMany({
    where: { companyId, productId, type: { in: INBOUND_LAYER_TYPES }, costLayerRemaining: { gt: 0 } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { id: true, costLayerRemaining: true, unitCost: true },
  });

  let need = money(quantity);
  let totalCost = money(0);
  for (const layer of layers) {
    if (!need.isPositive()) break;
    const available = money(layer.costLayerRemaining ?? 0);
    if (!available.isPositive()) continue;
    const take = Decimal.min(available, need);
    totalCost = totalCost.plus(take.times(layer.unitCost ?? 0));
    need = need.minus(take);
    if (commit) {
      await commit.stockMovement.update({
        where: { id: layer.id },
        data: { costLayerRemaining: available.minus(take).toNumber() },
      });
    }
  }
  if (need.isPositive()) {
    const fallback = await lastKnownUnitCost(companyId, productId);
    totalCost = totalCost.plus(need.times(fallback));
  }

  const unitCost = roundMoney(totalCost.dividedBy(quantity));
  return { totalCost: roundMoney(totalCost), unitCost };
}

/**
 * Read-only preview of what shipping `quantity` units would cost, without
 * consuming anything. Used to build the COGS/Inventory-Asset journal lines
 * *before* the invoice is posted, so the ledger entry and the physical
 * shipment (recorded moments later by shipStock, once the entry has
 * posted) agree on cost. Under a concurrent shipment of the same product
 * landing in between, the two could in principle diverge by a few cents —
 * an accepted, pre-existing limitation of this module (there is no
 * per-product locking on inventory), not something this preview tries to
 * solve.
 */
export async function previewFifoCost(companyId: string, productId: string, quantity: number): Promise<{ totalCost: number; unitCost: number }> {
  const { totalCost, unitCost } = await consumeOrPreviewFifoCost(companyId, productId, quantity);
  return { totalCost: totalCost.toNumber(), unitCost: unitCost.toNumber() };
}

/**
 * Record a shipment (e.g. from an Invoice), consuming FIFO cost layers and
 * returning the total/unit cost of what was shipped so the caller can
 * verify it matches the COGS lines already posted via previewFifoCost().
 * Called by the sales/invoice workflow. Enforces non-negative stock.
 */
export async function shipStock(
  companyId: string,
  userId: string,
  productId: string,
  quantity: number, // must be positive; stored as negative movement
  opts?: {
    referenceType?: string;
    referenceId?: string;
    date?: Date;
    notes?: string;
  }
): Promise<{ newQuantity: number; totalCost: number; unitCost: number }> {
  if (quantity <= 0) throw new Error("Shipment quantity must be positive.");

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true, name: true, quantityOnHand: true, trackInventory: true },
  });
  if (!product) throw new Error("Product not found.");
  if (!product.trackInventory) {
    throw new Error(`Product "${product.name}" does not have inventory tracking enabled.`);
  }
  const currentQty = product.quantityOnHand.toNumber();
  const newQty = currentQty - quantity;
  if (newQty < 0) {
    throw new Error(`Insufficient stock for "${product.name}". Available: ${currentQty}, requested: ${quantity}.`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const { totalCost, unitCost } = await consumeOrPreviewFifoCost(companyId, productId, quantity, tx);

    const movement = await tx.stockMovement.create({
      data: {
        companyId,
        productId,
        type: "SHIPMENT",
        quantity: -quantity,
        balanceAfter: newQty,
        unitCost: unitCost.toNumber(),
        notes: opts?.notes ?? null,
        referenceType: opts?.referenceType ?? null,
        referenceId: opts?.referenceId ?? null,
        date: opts?.date ?? new Date(),
        createdBy: userId,
      },
    });
    await tx.product.update({ where: { id: productId }, data: { quantityOnHand: newQty } });

    return { movement, totalCost, unitCost };
  });

  return { newQuantity: newQty, totalCost: result.totalCost.toNumber(), unitCost: result.unitCost.toNumber() };
}
