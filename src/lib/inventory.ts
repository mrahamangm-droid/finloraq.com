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

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockMovementType =
  | "RECEIPT"
  | "SHIPMENT"
  | "ADJUSTMENT"
  | "OPENING"
  | "RETURN_IN"
  | "RETURN_OUT";

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

  // Atomically update balance + create movement record
  const [movement] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        companyId,
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        balanceAfter: newQty,
        unitCost: data.unitCost ?? null,
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
 * Record a shipment (e.g. from an Invoice).
 * Called by the sales/invoice workflow. Enforces non-negative stock.
 */
export async function shipStock(
  companyId: string,
  userId: string,
  productId: string,
  quantity: number, // must be positive; stored as negative movement
  opts?: {
    unitCost?: number;
    referenceType?: string;
    referenceId?: string;
    date?: Date;
    notes?: string;
  }
): Promise<{ newQuantity: number }> {
  if (quantity <= 0) throw new Error("Shipment quantity must be positive.");

  const { newQuantity } = await recordMovement(companyId, {
    productId,
    type: "SHIPMENT",
    quantity: -quantity, // outbound = negative
    unitCost: opts?.unitCost ?? null,
    referenceType: opts?.referenceType ?? null,
    referenceId: opts?.referenceId ?? null,
    notes: opts?.notes ?? null,
    date: opts?.date ?? new Date(),
    createdBy: userId,
  });

  return { newQuantity };
}
