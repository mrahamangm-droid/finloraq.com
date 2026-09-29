"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";

// ─── Tax Code CRUD ─────────────────────────────────────────────────────────

export async function createTaxCodeAction(formData: FormData) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  const code      = (formData.get("code") as string).trim().toUpperCase();
  const name      = (formData.get("name") as string).trim();
  const rateRaw   = formData.get("rate") as string;
  const treatment = (formData.get("treatment") as string) || "STANDARD";
  const isInput   = formData.get("isInput") === "true";

  if (!code || !name || !rateRaw) throw new Error("Code, name and rate are required.");

  const rate = parseFloat(rateRaw) / 100; // UI sends 5 → store 0.0500
  if (isNaN(rate) || rate < 0 || rate > 1)
    throw new Error("Rate must be between 0 and 100.");

  await prisma.taxCode.create({
    data: {
      companyId:   active.company.id,
      countryCode: active.company.countryCode ?? "AE",
      code,
      name,
      rate,
      treatment:   treatment as any,
      isInput,
      isActive:    true,
    },
  });

  revalidatePath("/taxes");
}

export async function updateTaxCodeAction(taxCodeId: string, formData: FormData) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  // Verify ownership
  const tc = await prisma.taxCode.findFirst({ where: { id: taxCodeId, companyId: active.company.id } });
  if (!tc) throw new Error("Tax code not found.");

  const name      = (formData.get("name") as string).trim();
  const rateRaw   = formData.get("rate") as string;
  const treatment = (formData.get("treatment") as string) || tc.treatment;
  const isInput   = formData.get("isInput") === "true";
  const isActive  = formData.get("isActive") !== "false";

  const rate = rateRaw ? parseFloat(rateRaw) / 100 : undefined;
  if (rate !== undefined && (isNaN(rate) || rate < 0 || rate > 1))
    throw new Error("Rate must be between 0 and 100.");

  await prisma.taxCode.update({
    where: { id: taxCodeId },
    data: {
      name,
      ...(rate !== undefined ? { rate } : {}),
      treatment: treatment as any,
      isInput,
      isActive,
    },
  });

  revalidatePath("/taxes");
}

export async function toggleTaxCodeAction(taxCodeId: string, isActive: boolean) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  const tc = await prisma.taxCode.findFirst({ where: { id: taxCodeId, companyId: active.company.id } });
  if (!tc) throw new Error("Tax code not found.");

  await prisma.taxCode.update({ where: { id: taxCodeId }, data: { isActive } });
  revalidatePath("/taxes");
}

export async function deleteTaxCodeAction(taxCodeId: string) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  const tc = await prisma.taxCode.findFirst({
    where: { id: taxCodeId, companyId: active.company.id },
    include: { _count: { select: { invoiceLines: true, billLines: true } } },
  });
  if (!tc) throw new Error("Tax code not found.");

  const used = (tc._count?.invoiceLines ?? 0) + (tc._count?.billLines ?? 0);
  if (used > 0)
    throw new Error(`Cannot delete — this tax code is used on ${used} invoice/bill line(s). Deactivate it instead.`);

  await prisma.taxCode.delete({ where: { id: taxCodeId } });
  revalidatePath("/taxes");
}
