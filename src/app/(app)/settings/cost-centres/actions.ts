"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function createCostCentreAction(formData: FormData) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  const code = (formData.get("code") as string).trim().toUpperCase();
  const name = (formData.get("name") as string).trim();
  if (!code || !name) throw new Error("Code and name are required.");

  await prisma.costCentre.create({
    data: { companyId: active.company.id, code, name, isActive: true },
  });

  revalidatePath("/settings/cost-centres");
  revalidatePath("/accounting/journals/new");
}

export async function updateCostCentreAction(id: string, formData: FormData) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  const cc = await prisma.costCentre.findFirst({ where: { id, companyId: active.company.id } });
  if (!cc) throw new Error("Cost centre not found.");

  const name = (formData.get("name") as string).trim();
  if (!name) throw new Error("Name is required.");

  await prisma.costCentre.update({ where: { id }, data: { name } });
  revalidatePath("/settings/cost-centres");
}

export async function toggleCostCentreAction(id: string, isActive: boolean) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  const cc = await prisma.costCentre.findFirst({ where: { id, companyId: active.company.id } });
  if (!cc) throw new Error("Cost centre not found.");

  await prisma.costCentre.update({ where: { id }, data: { isActive } });
  revalidatePath("/settings/cost-centres");
  revalidatePath("/accounting/journals/new");
}

export async function deleteCostCentreAction(id: string) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  const cc = await prisma.costCentre.findFirst({ where: { id, companyId: active.company.id } });
  if (!cc) throw new Error("Cost centre not found.");

  // Check if used in journal lines
  const usageCount = await prisma.journalLine.count({ where: { costCentreId: id } });
  if (usageCount > 0) {
    throw new Error(
      `Cannot delete — this cost centre is referenced in ${usageCount} journal line(s). Deactivate it instead.`
    );
  }

  await prisma.costCentre.delete({ where: { id } });
  revalidatePath("/settings/cost-centres");
  revalidatePath("/accounting/journals/new");
}
