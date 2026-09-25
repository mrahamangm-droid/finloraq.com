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

/** Thrown when a delete is refused because the record has history attached to it. */
export class PartyInUseError extends Error {}

/**
 * Permanently removes a customer. Refused when any invoice — posted or
 * draft — was ever raised against them, since that would orphan financial
 * records; archive (setCustomerActive) is the right move for a customer
 * with history. Admin-only by default (see the "customers" DELETE row in
 * src/lib/rbac.ts's role matrix).
 */
export async function deleteCustomer(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  customerId: string;
}) {
  await requirePermission(params.membershipId, "customers", "DELETE");

  const customer = await prisma.customer.findFirst({ where: { id: params.customerId, companyId: params.companyId } });
  if (!customer) throw new Error("Customer not found.");

  const invoiceCount = await prisma.invoice.count({ where: { customerId: customer.id } });
  if (invoiceCount > 0) {
    throw new PartyInUseError(
      `${customer.name} has ${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"} on record and can't be deleted. Archive them instead to hide them without losing that history.`
    );
  }

  await prisma.customer.delete({ where: { id: customer.id } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "customer.deleted",
    entityType: "Customer",
    entityId: customer.id,
    previousValue: { name: customer.name, email: customer.email },
  });
}

/**
 * Archives or restores a customer (toggles Customer.isActive) instead of
 * deleting them — the safe option once they have invoice history. Archived
 * customers drop out of the active list and the "new invoice" picker but
 * keep every past record intact.
 */
export async function setCustomerActive(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  customerId: string;
  isActive: boolean;
}) {
  await requirePermission(params.membershipId, "customers", "DELETE");

  const customer = await prisma.customer.findFirst({ where: { id: params.customerId, companyId: params.companyId } });
  if (!customer) throw new Error("Customer not found.");

  const updated = await prisma.customer.update({ where: { id: customer.id }, data: { isActive: params.isActive } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: params.isActive ? "customer.restored" : "customer.archived",
    entityType: "Customer",
    entityId: customer.id,
  });

  return updated;
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

/**
 * Permanently removes a supplier. Refused when any bill — posted or draft
 * — was ever raised against them, since that would orphan financial
 * records; archive (setSupplierActive) is the right move for a supplier
 * with history. Admin-only by default (see the "suppliers" DELETE row in
 * src/lib/rbac.ts's role matrix). Mirrors deleteCustomer() above, checking
 * Bill instead of Invoice.
 */
export async function deleteSupplier(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  supplierId: string;
}) {
  await requirePermission(params.membershipId, "suppliers", "DELETE");

  const supplier = await prisma.supplier.findFirst({ where: { id: params.supplierId, companyId: params.companyId } });
  if (!supplier) throw new Error("Supplier not found.");

  const billCount = await prisma.bill.count({ where: { supplierId: supplier.id } });
  if (billCount > 0) {
    throw new PartyInUseError(
      `${supplier.name} has ${billCount} bill${billCount === 1 ? "" : "s"} on record and can't be deleted. Archive them instead to hide them without losing that history.`
    );
  }

  await prisma.supplier.delete({ where: { id: supplier.id } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "supplier.deleted",
    entityType: "Supplier",
    entityId: supplier.id,
    previousValue: { name: supplier.name, email: supplier.email },
  });
}

/**
 * Archives or restores a supplier (toggles Supplier.isActive) instead of
 * deleting them — the safe option once they have bill history. Archived
 * suppliers drop out of the active list and the "new bill" picker but
 * keep every past record intact. Mirrors setCustomerActive() above.
 */
export async function setSupplierActive(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  supplierId: string;
  isActive: boolean;
}) {
  await requirePermission(params.membershipId, "suppliers", "DELETE");

  const supplier = await prisma.supplier.findFirst({ where: { id: params.supplierId, companyId: params.companyId } });
  if (!supplier) throw new Error("Supplier not found.");

  const updated = await prisma.supplier.update({ where: { id: supplier.id }, data: { isActive: params.isActive } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: params.isActive ? "supplier.restored" : "supplier.archived",
    entityType: "Supplier",
    entityId: supplier.id,
  });

  return updated;
}
