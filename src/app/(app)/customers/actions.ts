"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { createCustomer } from "@/lib/parties";

export async function createCustomerAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  await createCustomer({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    name: String(formData.get("name") ?? ""),
    email: (formData.get("email") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    paymentTermsDays: formData.get("paymentTermsDays") ? Number(formData.get("paymentTermsDays")) : undefined,
  });

  revalidatePath("/customers");
}
