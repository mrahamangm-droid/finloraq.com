"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/rbac";
import { ApprovalRuleError } from "@/lib/approvals";
import { createExpenseApprovalRule, deleteExpenseApprovalRule, setExpenseApprovalRuleActive } from "@/lib/approvalRules";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/settings/approvals");
    return { ok: true };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "Only people who can edit company settings can change approval rules." };
    if (err instanceof ApprovalRuleError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function createApprovalRuleAction(input: { minAmount: number | null; maxAmount: number | null; requiredRole: string }): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(() => createExpenseApprovalRule({ companyId: active.companyId, membershipId: active.id, userId, ...input }));
}

export async function setApprovalRuleActiveAction(ruleId: string, isActive: boolean): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(() => setExpenseApprovalRuleActive({ companyId: active.companyId, membershipId: active.id, userId, ruleId, isActive }));
}

export async function deleteApprovalRuleAction(ruleId: string): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(() => deleteExpenseApprovalRule({ companyId: active.companyId, membershipId: active.id, userId, ruleId }));
}
