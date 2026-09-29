"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import {
  createWorkflowRule,
  updateWorkflowRule,
  deleteWorkflowRule,
} from "@/lib/workflow";
import type { CompanyRole } from "@prisma/client";

export async function createWorkflowRuleAction(formData: FormData) {
  const { active } = await requireTenantContext();

  const minRaw = formData.get("minAmount") as string;
  const maxRaw = formData.get("maxAmount") as string;

  await createWorkflowRule({
    companyId:   active.company.id,
    membershipId: active.id,
    userId:      active.userId,
    data: {
      name:         (formData.get("name") as string).trim(),
      entityType:   formData.get("entityType") as string,
      minAmount:    minRaw ? parseFloat(minRaw) : null,
      maxAmount:    maxRaw ? parseFloat(maxRaw) : null,
      requiredRole: formData.get("requiredRole") as CompanyRole,
    },
  });

  revalidatePath("/settings/workflows");
}

export async function updateWorkflowRuleAction(ruleId: string, formData: FormData) {
  const { active } = await requireTenantContext();

  const minRaw = formData.get("minAmount") as string;
  const maxRaw = formData.get("maxAmount") as string;

  await updateWorkflowRule({
    companyId:   active.company.id,
    membershipId: active.id,
    userId:      active.userId,
    ruleId,
    data: {
      name:         (formData.get("name") as string).trim(),
      entityType:   formData.get("entityType") as string,
      minAmount:    minRaw ? parseFloat(minRaw) : null,
      maxAmount:    maxRaw ? parseFloat(maxRaw) : null,
      requiredRole: formData.get("requiredRole") as CompanyRole,
    },
  });

  revalidatePath("/settings/workflows");
}

export async function toggleWorkflowRuleAction(ruleId: string, isActive: boolean) {
  const { active } = await requireTenantContext();

  await updateWorkflowRule({
    companyId:   active.company.id,
    membershipId: active.id,
    userId:      active.userId,
    ruleId,
    data: { isActive },
  });

  revalidatePath("/settings/workflows");
}

export async function deleteWorkflowRuleAction(ruleId: string) {
  const { active } = await requireTenantContext();

  await deleteWorkflowRule({
    companyId:   active.company.id,
    membershipId: active.id,
    userId:      active.userId,
    ruleId,
  });

  revalidatePath("/settings/workflows");
}
