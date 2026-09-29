/**
 * Products / Items catalog business logic.
 *
 * Products are reusable line-item templates. They can be referenced by invoices,
 * bills, quotes, and PO lines so staff don't re-type the same description,
 * price, and tax code on every transaction. Inventory tracking is optional —
 * when enabled, quantityOnHand is decremented on invoice post and incremented
 * on bill post (COGS flow).
 *
 * All functions are tenant-scoped: every query filters on companyId resolved
 * server-side from requireTenantContext(). Never trust companyId from the client.
 */

import { prisma } from "@/lib/db";
import type { ProductType } from "@prisma/client";

export interface ProductInput {
  name: string;
  description?: string | null;
  sku?: string | null;
  type?: ProductType;
  unitPrice: number;
  currency?: string;
  unit?: string | null;
  incomeAccountCode?: string | null;
  expenseAccountCode?: string | null;
  taxCodeId?: string | null;
  trackInventory?: boolean;
  quantityOnHand?: number;
  reorderPoint?: number | null;
}

export async function listProducts(
  companyId: string,
  opts: {
    search?: string;
    type?: ProductType;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  } = {}
) {
  const { search, type, includeInactive = false, page = 1, limit = 100 } = opts;
  const where = {
    companyId,
    ...(includeInactive ? {} : { isActive: true }),
    ...(type ? { type } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { sku: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { taxCode: { select: { id: true, code: true, name: true, rate: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { items, total, page, limit };
}

export async function getProduct(companyId: string, id: string) {
  return prisma.product.findFirst({
    where: { id, companyId },
    include: { taxCode: { select: { id: true, code: true, name: true, rate: true } } },
  });
}

export async function createProduct(companyId: string, data: ProductInput) {
  // If a SKU is provided, check it isn't already taken within this company.
  if (data.sku) {
    const existing = await prisma.product.findFirst({
      where: { companyId, sku: data.sku },
    });
    if (existing) throw new Error(`SKU "${data.sku}" is already in use.`);
  }

  return prisma.product.create({
    data: {
      companyId,
      name: data.name,
      description: data.description ?? null,
      sku: data.sku ?? null,
      type: data.type ?? "PRODUCT",
      unitPrice: data.unitPrice,
      currency: data.currency ?? "USD",
      unit: data.unit ?? null,
      incomeAccountCode: data.incomeAccountCode ?? null,
      expenseAccountCode: data.expenseAccountCode ?? null,
      taxCodeId: data.taxCodeId ?? null,
      trackInventory: data.trackInventory ?? false,
      quantityOnHand: data.quantityOnHand ?? 0,
      reorderPoint: data.reorderPoint ?? null,
    },
    include: { taxCode: { select: { id: true, code: true, name: true, rate: true } } },
  });
}

export async function updateProduct(
  companyId: string,
  id: string,
  data: Partial<ProductInput>
) {
  const product = await prisma.product.findFirst({ where: { id, companyId } });
  if (!product) return null;

  // SKU uniqueness check if SKU is being changed.
  if (data.sku !== undefined && data.sku !== product.sku && data.sku) {
    const conflict = await prisma.product.findFirst({
      where: { companyId, sku: data.sku, NOT: { id } },
    });
    if (conflict) throw new Error(`SKU "${data.sku}" is already in use.`);
  }

  return prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.sku !== undefined ? { sku: data.sku } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.unitPrice !== undefined ? { unitPrice: data.unitPrice } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.unit !== undefined ? { unit: data.unit } : {}),
      ...(data.incomeAccountCode !== undefined ? { incomeAccountCode: data.incomeAccountCode } : {}),
      ...(data.expenseAccountCode !== undefined ? { expenseAccountCode: data.expenseAccountCode } : {}),
      ...(data.taxCodeId !== undefined ? { taxCodeId: data.taxCodeId } : {}),
      ...(data.trackInventory !== undefined ? { trackInventory: data.trackInventory } : {}),
      ...(data.quantityOnHand !== undefined ? { quantityOnHand: data.quantityOnHand } : {}),
      ...(data.reorderPoint !== undefined ? { reorderPoint: data.reorderPoint } : {}),
    },
    include: { taxCode: { select: { id: true, code: true, name: true, rate: true } } },
  });
}

export async function archiveProduct(companyId: string, id: string) {
  const product = await prisma.product.findFirst({ where: { id, companyId } });
  if (!product) return null;
  return prisma.product.update({ where: { id }, data: { isActive: false } });
}

export async function restoreProduct(companyId: string, id: string) {
  const product = await prisma.product.findFirst({ where: { id, companyId } });
  if (!product) return null;
  return prisma.product.update({ where: { id }, data: { isActive: true } });
}

/**
 * Adjust stock quantity (inventory tracking only). Used by the invoice
 * posting flow (decrement) and bill posting flow (increment).
 * Never called directly by the client — always triggered inside a
 * database transaction from the invoice/bill posting path in ledger.ts.
 */
export async function adjustInventory(
  tx: { product: { findFirst: typeof prisma.product.findFirst; update: typeof prisma.product.update } },
  companyId: string,
  productId: string,
  delta: number // positive = increase, negative = decrease
) {
  const product = await tx.product.findFirst({ where: { id: productId, companyId, trackInventory: true } });
  if (!product) return null;

  const newQty = Number((product as { quantityOnHand: { toNumber?: () => number } | number }).quantityOnHand) + delta;
  return tx.product.update({
    where: { id: productId },
    data: { quantityOnHand: newQty },
  });
}
