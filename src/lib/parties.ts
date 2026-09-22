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
