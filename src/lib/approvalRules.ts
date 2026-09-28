import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { validateApprovalRule, ApprovalRuleError } from "@/lib/approvals";

/**
 * Settings → Approvals: the company's expense approval rules (WorkflowRule
 * rows with entityType "Expense"). Reading is for anyone who can view
 * settings; every change needs settings:EDIT, the same bar as the rest of
 * company settings, and is audited.
 */
export async function listExpenseApprovalRules(companyId: string) {
  const rules = await prisma.workflowRule.findMany({
    where: { companyId, entityType: "Expense" },
    orderBy: [{ minAmount: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    include: { _count: { select: { approvals: true } } },
  });
  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    minAmount: r.minAmount === null ? null : r.minAmount.toNumber(),
    maxAmount: r.maxAmount === null ? null : r.maxAmount.toNumber(),
    requiredRole: r.requiredRole,
    isActive: r.isActive,
    timesUsed: r._count.approvals,
  }));
}

export async function createExpenseApprovalRule(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  minAmount: number | null;
  maxAmount: number | null;
  requiredRole: string;
}) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const v = validateApprovalRule(params);
  const name = `Expenses ${v.minAmount ?? 0}${v.maxAmount === null ? "+" : `–${v.maxAmount}`} → ${v.requiredRole}`;
  const rule = await prisma.workflowRule.create({
    data: { companyId: params.companyId, name, entityType: "Expense", minAmount: v.minAmount, maxAmount: v.maxAmount, requiredRole: v.requiredRole },
  });
  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "approval_rule.created",
    entityType: "WorkflowRule",
    entityId: rule.id,
    newValue: { minAmount: v.minAmount, maxAmount: v.maxAmount, requiredRole: v.requiredRole },
  });
  return rule;
}

export async function setExpenseApprovalRuleActive(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  ruleId: string;
  isActive: boolean;
}) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const rule = await prisma.workflowRule.findFirst({ where: { id: params.ruleId, companyId: params.companyId, entityType: "Expense" } });
  if (!rule) throw new ApprovalRuleError("Rule not found.");
  await prisma.workflowRule.update({ where: { id: rule.id }, data: { isActive: params.isActive } });
  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: params.isActive ? "approval_rule.enabled" : "approval_rule.disabled",
    entityType: "WorkflowRule",
    entityId: rule.id,
  });
}

/** Deletes a rule that has never been used. A used rule is referenced by the
 *  Approval rows that record who approved what under it, so it can only be
 *  turned off — that history stays intact. */
export async function deleteExpenseApprovalRule(params: { companyId: string; membershipId: string; userId: string; ruleId: string }) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const rule = await prisma.workflowRule.findFirst({
    where: { id: params.ruleId, companyId: params.companyId, entityType: "Expense" },
    include: { _count: { select: { approvals: true } } },
  });
  if (!rule) throw new ApprovalRuleError("Rule not found.");
  if (rule._count.approvals > 0) {
    throw new ApprovalRuleError("This rule has already been used to approve expenses, so it can only be turned off, not deleted.");
  }
  await prisma.workflowRule.delete({ where: { id: rule.id } });
  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "approval_rule.deleted",
    entityType: "WorkflowRule",
    entityId: rule.id,
    previousValue: { minAmount: rule.minAmount?.toString() ?? null, maxAmount: rule.maxAmount?.toString() ?? null, requiredRole: rule.requiredRole },
  });
}
