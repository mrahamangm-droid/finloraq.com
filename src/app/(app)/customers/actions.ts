"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireTenantContext } from "@/lib/tenant";
import { fieldDefs } from "@/lib/customization/server";
import { customFieldsFromForm } from "@/lib/customization/customFields";
import { createCustomer } from "@/lib/parties";

export async function createCustomerAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  // Validate custom fields before anything is written, so a bad value never
  // leaves a half-saved record behind.
  const defs = await fieldDefs(active.companyId, "CUSTOMER");
  const customFields = customFieldsFromForm(defs, formData);

  const created = await createCustomer({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    name: String(formData.get("name") ?? ""),
    email: (formData.get("email") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    paymentTermsDays: formData.get("paymentTermsDays") ? Number(formData.get("paymentTermsDays")) : undefined,
  });

  if (defs.length > 0) {
    await prisma.customer.update({
      where: { id: created.id },
      data: { customFields: customFields as Prisma.InputJsonValue },
    });
  }

  revalidatePath("/customers");
}
