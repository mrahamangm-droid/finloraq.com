import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

export async function createCustomer(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  paymentTermsDays?: number;
}) {
  await requirePermission(params.membershipId, "customers", "CREATE");

  const customer = await prisma.customer.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      email: params.email,
      phone: params.phone,
      paymentTermsDays: params.paymentTermsDays ?? 30,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "customer.created",
    entityType: "Customer",
    entityId: customer.id,
    newValue: { name: customer.name },
  });

  return customer;
}

/**
 * Fills in fields on an existing Customer from a human-reviewed document
 * match (Customer File Intelligence — src/lib/ai/customer-extraction.ts).
 * Only fields the reviewer explicitly confirmed are passed in `fields`;
 * anything left out here is left untouched on the existing record. This
 * never runs on the raw AI extraction directly — the caller (the review
 * queue API route) is expected to have shown the extracted values to a
 * person first, same trust model as createDraftExpenseFromExtraction() in
 * src/lib/ai/extraction.ts.
 */
export async function updateCustomerFromReview(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  customerId: string;
  fields: { email?: string; phone?: string };
  documentId: string;
}) {
  await requirePermission(params.membershipId, "customers", "EDIT");

  const before = await prisma.customer.findFirst({ where: { id: params.customerId, companyId: params.companyId } });
  if (!before) throw new Error("Customer not found.");

  const customer = await prisma.customer.update({
    where: { id: params.customerId },
    data: {
      email: params.fields.email !== undefined ? params.fields.email : undefined,
      phone: params.fields.phone !== undefined ? params.fields.phone : undefined,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "customer.updated_from_document",
    entityType: "Customer",
    entityId: customer.id,
    previousValue: { email: before.email, phone: before.phone },
    newValue: { email: customer.email, phone: customer.phone, documentId: params.documentId },
    source: "ai",
  });

  return customer;
}

export async function createSupplier(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  paymentTermsDays?: number;
}) {
  await requirePermission(params.membershipId, "suppliers", "CREATE");

  const supplier = await prisma.supplier.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      email: params.email,
      phone: params.phone,
      paymentTermsDays: params.paymentTermsDays ?? 30,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "supplier.created",
    entityType: "Supplier",
    entityId: supplier.id,
    newValue: { name: supplier.name },
  });

  return supplier;
}
