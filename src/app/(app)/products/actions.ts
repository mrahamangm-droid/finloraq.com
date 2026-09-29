"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { createProduct, updateProduct, archiveProduct, restoreProduct } from "@/lib/products";

export async function createProductAction(formData: FormData) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "CREATE");

  const unitPrice = parseFloat(String(formData.get("unitPrice") ?? "0"));
  const quantityOnHand = parseFloat(String(formData.get("quantityOnHand") ?? "0"));
  const reorderPointRaw = formData.get("reorderPoint");
  const reorderPoint = reorderPointRaw ? parseFloat(String(reorderPointRaw)) : null;
  const trackInventory = formData.get("trackInventory") === "on";

  await createProduct(active.companyId, {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    sku: String(formData.get("sku") ?? "").trim() || null,
    type: (formData.get("type") as "PRODUCT" | "SERVICE") ?? "PRODUCT",
    unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
    currency: active.company.baseCurrency,
    unit: String(formData.get("unit") ?? "").trim() || null,
    incomeAccountCode: String(formData.get("incomeAccountCode") ?? "").trim() || null,
    expenseAccountCode: String(formData.get("expenseAccountCode") ?? "").trim() || null,
    taxCodeId: String(formData.get("taxCodeId") ?? "").trim() || null,
    trackInventory,
    quantityOnHand: trackInventory ? (isNaN(quantityOnHand) ? 0 : quantityOnHand) : 0,
    reorderPoint: trackInventory ? reorderPoint : null,
  });

  revalidatePath("/products");
  redirect(`/products`);
}

export async function updateProductAction(id: string, formData: FormData) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "EDIT");

  const unitPrice = parseFloat(String(formData.get("unitPrice") ?? "0"));
  const quantityOnHand = parseFloat(String(formData.get("quantityOnHand") ?? "0"));
  const reorderPointRaw = formData.get("reorderPoint");
  const reorderPoint = reorderPointRaw ? parseFloat(String(reorderPointRaw)) : null;
  const trackInventory = formData.get("trackInventory") === "on";

  await updateProduct(active.companyId, id, {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    sku: String(formData.get("sku") ?? "").trim() || null,
    type: (formData.get("type") as "PRODUCT" | "SERVICE") ?? "PRODUCT",
    unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
    unit: String(formData.get("unit") ?? "").trim() || null,
    incomeAccountCode: String(formData.get("incomeAccountCode") ?? "").trim() || null,
    expenseAccountCode: String(formData.get("expenseAccountCode") ?? "").trim() || null,
    taxCodeId: String(formData.get("taxCodeId") ?? "").trim() || null,
    trackInventory,
    quantityOnHand: trackInventory ? (isNaN(quantityOnHand) ? 0 : quantityOnHand) : 0,
    reorderPoint: trackInventory ? reorderPoint : null,
  });

  revalidatePath("/products");
  redirect(`/products`);
}

export async function archiveProductAction(id: string) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "DELETE");
  await archiveProduct(active.companyId, id);
  revalidatePath("/products");
}

export async function restoreProductAction(id: string) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "EDIT");
  await restoreProduct(active.companyId, id);
  revalidatePath("/products");
}
