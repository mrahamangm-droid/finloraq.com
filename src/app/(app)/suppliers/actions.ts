"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireTenantContext } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/rbac";
import { fieldDefs } from "@/lib/customization/server";
import { customFieldsFromForm } from "@/lib/customization/customFields";
import { createSupplier, deleteSupplier, setSupplierActive, PartyInUseError } from "@/lib/parties";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/suppliers");
    return { ok: true };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "Only a company admin can do this." };
    if (err instanceof PartyInUseError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function createSupplierAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  // Validate custom fields before anything is written, so a bad value never
  // leaves a half-saved record behind.
  const defs = await fieldDefs(active.companyId, "SUPPLIER");
  const customFields = customFieldsFromForm(defs, formData);

  const created = await createSupplier({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    name: String(formData.get("name") ?? ""),
    email: (formData.get("email") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    paymentTermsDays: formData.get("paymentTermsDays") ? Number(formData.get("paymentTermsDays")) : undefined,
  });

  if (defs.length > 0) {
    await prisma.supplier.update({
      where: { id: created.id },
      data: { customFields: customFields as Prisma.InputJsonValue },
    });
  }

  revalidatePath("/suppliers");
}

export async function deleteSupplierAction(supplierId: string): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(() => deleteSupplier({ companyId: active.companyId, membershipId: active.id, userId, supplierId }));
}

export async function setSupplierActiveAction(supplierId: string, isActive: boolean): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(() => setSupplierActive({ companyId: active.companyId, membershipId: active.id, userId, supplierId, isActive }));
}
