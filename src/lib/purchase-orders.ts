import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { roundMoney } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import { createBill } from "@/lib/purchases";

export interface POLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
}

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

export async function getPurchaseOrder(
  companyId: string,
  membershipId: string,
  id: string
) {
  await requirePermission(membershipId, "purchase_orders", "VIEW");
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      supplier: true,
      project: true,
      bill: true,
      lines: { include: { taxCode: true } },
    },
  });
  if (!po) throw new Error("Purchase order not found");
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
  notes?: string;
  lines: POLineInput[];
}) {
  await requirePermission(params.membershipId, "purchase_orders", "CREATE");

  if (params.lines.length === 0) throw new Error("A purchase order needs at least one line.");

  const { lines: computed, subtotal, taxTotal, total } = await computeTaxedLines(
    prisma, params.companyId, params.lines
  );

  const po = await prisma.$transaction(async (tx: any) => {
    const poNumber = await nextDocumentNumber(
      tx, params.companyId, "PO",
      () => tx.purchaseOrder.findFirst({
        where: { companyId: params.companyId },
        orderBy: { poNumber: "desc" },
        select: { poNumber: true },
      }).then((r: any) => (r ? { number: r.poNumber } : null))
    );

    return tx.purchaseOrder.create({
      data: {
        companyId: params.companyId,
        supplierId: params.supplierId,
        projectId: params.projectId,
        poNumber,
        issueDate: params.issueDate,
        expectedDate: params.expectedDate,
        currency: params.currency,
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
            taxCodeId: l.line.taxCodeId,
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
    newValue: { poNumber: po.poNumber, total: po.total.toString() },
  });

  return po;
}

// ─── Update status ────────────────────────────────────────────────────────────

type POStatus = "DRAFT" | "SENT" | "ACKNOWLEDGED" | "RECEIVED" | "BILLED" | "CANCELLED";

export async function updatePurchaseOrderStatus(
  companyId: string,
  membershipId: string,
  userId: string,
  id: string,
  status: POStatus
) {
  await requirePermission(membershipId, "purchase_orders", "EDIT");

  const po = await prisma.purchaseOrder.findFirst({ where: { id, companyId } });
  if (!po) throw new Error("Purchase order not found");
  if (po.status === "BILLED") throw new Error("Cannot change status of a billed PO.");

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status },
  });

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

// ─── Convert received PO → Bill ───────────────────────────────────────────────

export async function convertPOToBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  poId: string;
  dueDate: Date;
}) {
  await requirePermission(params.membershipId, "purchase_orders", "EDIT");
  await requirePermission(params.membershipId, "bills", "CREATE");

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: params.poId, companyId: params.companyId },
    include: { lines: true },
  });
  if (!po) throw new Error("Purchase order not found");
  if (po.status !== "RECEIVED") throw new Error("Only a received PO can be converted to a bill.");
  if (po.billId) throw new Error("This PO has already been converted to a bill.");

  const bill = await createBill({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    supplierId: po.supplierId,
    issueDate: new Date(),
    dueDate: params.dueDate,
    currency: po.currency,
    lines: po.lines.map((l: any) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      taxCodeId: l.taxCodeId ?? undefined,
    })),
  });

  await prisma.purchaseOrder.update({
    where: { id: params.poId },
    data: { status: "BILLED", billId: bill.id },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "purchase_order.converted_to_bill",
    entityType: "PurchaseOrder",
    entityId: params.poId,
    newValue: { billId: bill.id },
  });

  return bill;
}

// ─── Delete (draft only) ──────────────────────────────────────────────────────

export async function deletePurchaseOrder(
  companyId: string,
  membershipId: string,
  userId: string,
  id: string
) {
  await requirePermission(membershipId, "purchase_orders", "DELETE");

  const po = await prisma.purchaseOrder.findFirst({ where: { id, companyId } });
  if (!po) throw new Error("Purchase order not found");
  if (po.status !== "DRAFT") throw new Error("Only draft POs can be deleted.");

  await prisma.purchaseOrder.delete({ where: { id } });

  await recordAuditEvent({
    companyId,
    userId,
    action: "purchase_order.deleted",
    entityType: "PurchaseOrder",
    entityId: id,
    previousValue: { poNumber: po.poNumber },
  });
}
