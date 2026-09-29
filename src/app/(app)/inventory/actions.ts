"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { adjustStock, setOpeningStock } from "@/lib/inventory";

// ─── Manual stock adjustment ──────────────────────────────────────────────────

export async function adjustStockAction(
  productId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { active, userId } = await requireTenantContext();

    const qtyStr = formData.get("quantity") as string;
    const notes = (formData.get("notes") as string)?.trim() || undefined;
    const dateStr = formData.get("date") as string;
    const unitCostStr = formData.get("unitCost") as string;

    const quantity = parseFloat(qtyStr);
    if (isNaN(quantity) || quantity === 0) {
      return { error: "Quantity must be a non-zero number." };
    }

    await adjustStock(active.companyId, active.id, userId, productId, quantity, {
      notes,
      date: dateStr ? new Date(dateStr) : undefined,
      unitCost: unitCostStr ? parseFloat(unitCostStr) : undefined,
    });

    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ─── Set opening stock ────────────────────────────────────────────────────────

export async function setOpeningStockAction(
  productId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { active, userId } = await requireTenantContext();

    const qtyStr = formData.get("quantity") as string;
    const unitCostStr = formData.get("unitCost") as string;
    const dateStr = formData.get("date") as string;
    const notes = (formData.get("notes") as string)?.trim() || "Opening stock";

    const quantity = parseFloat(qtyStr);
    if (isNaN(quantity) || quantity < 0) {
      return { error: "Opening quantity must be a non-negative number." };
    }

    await setOpeningStock(active.companyId, active.id, userId, productId, quantity, {
      unitCost: unitCostStr ? parseFloat(unitCostStr) : undefined,
      date: dateStr ? new Date(dateStr) : undefined,
      notes,
    });

    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
