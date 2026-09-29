/**
 * Workflow Automation & Approval Engine
 *
 * WorkflowRules define: for a given entity type (e.g. "Expense") and an
 * optional amount range, which CompanyRole must approve before the entity
 * can be posted/processed.
 *
 * Approval records track the decision: PENDING means waiting for the
 * required role; APPROVED / REJECTED are terminal states.
 *
 * The actual posting (e.g. postDraftJournalEntry) happens in the caller
 * (e.g. approveExpense in expenses.ts) — this file only manages the
 * gate-keeping logic and approval records.
 */

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import type { CompanyRole } from "@prisma/client";

// ─── Role hierarchy ────────────────────────────────────────────────────────────
// Higher number = more authority. Used to decide whether a caller's role
// satisfies a WorkflowRule's requiredRole.

const ROLE_LEVEL: Record<CompanyRole, number> = {
  COMPANY_ADMIN:   100,
  CFO:              80,
  FINANCE_MANAGER:  60,
  ACCOUNTANT:       40,
  STAFF:            20,
  AUDITOR:          10,
};

/** True when callerRole is at least as authoritative as requiredRole. */
export function roleAtLeast(callerRole: CompanyRole, requiredRole: CompanyRole): boolean {
  return (ROLE_LEVEL[callerRole] ?? 0) >= (ROLE_LEVEL[requiredRole] ?? 0);
}

// ─── WorkflowRule CRUD ─────────────────────────────────────────────────────────

export interface WorkflowRuleInput {
  name:         string;
  entityType:   string;
  minAmount?:   number | null;
  maxAmount?:   number | null;
  requiredRole: CompanyRole;
}

export async function listWorkflowRules(companyId: string, membershipId: string) {
  await requirePermission(membershipId, "settings", "VIEW");
  return prisma.workflowRule.findMany({
    where:   { companyId },
    orderBy: { name: "asc" },
  });
}

export async function createWorkflowRule(params: {
  companyId:   string;
  membershipId: string;
  userId:       string;
  data:         WorkflowRuleInput;
}) {
  await requirePermission(params.membershipId, "settings", "EDIT");

  if (params.data.minAmount != null && params.data.maxAmount != null
      && params.data.minAmount > params.data.maxAmount) {
    throw new Error("minAmount must be less than or equal to maxAmount.");
  }

  const rule = await prisma.workflowRule.create({
    data: {
      companyId:    params.companyId,
      name:         params.data.name.trim(),
      entityType:   params.data.entityType,
      minAmount:    params.data.minAmount ?? null,
      maxAmount:    params.data.maxAmount ?? null,
      requiredRole: params.data.requiredRole,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId:    params.userId,
    action:    "workflowRule.created",
    entityType: "WorkflowRule",
    entityId:  rule.id,
    newValue:  { name: rule.name, entityType: rule.entityType, requiredRole: rule.requiredRole },
  });

  return rule;
}

export async function updateWorkflowRule(params: {
  companyId:   string;
  membershipId: string;
  userId:       string;
  ruleId:       string;
  data:         Partial<WorkflowRuleInput & { isActive: boolean }>;
}) {
  await requirePermission(params.membershipId, "settings", "EDIT");

  const rule = await prisma.workflowRule.findFirst({
    where: { id: params.ruleId, companyId: params.companyId },
  });
  if (!rule) throw new Error("Workflow rule not found.");

  const updated = await prisma.workflowRule.update({
    where: { id: rule.id },
    data: {
      ...(params.data.name        != null ? { name: params.data.name.trim() } : {}),
      ...(params.data.entityType  != null ? { entityType: params.data.entityType } : {}),
      ...(params.data.requiredRole != null ? { requiredRole: params.data.requiredRole } : {}),
      ...(Object.prototype.hasOwnProperty.call(params.data, "minAmount")
          ? { minAmount: params.data.minAmount ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(params.data, "maxAmount")
          ? { maxAmount: params.data.maxAmount ?? null } : {}),
      ...(params.data.isActive != null ? { isActive: params.data.isActive } : {}),
    },
  });

  await recordAuditEvent({
    companyId:  params.companyId,
    userId:     params.userId,
    action:     "workflowRule.updated",
    entityType: "WorkflowRule",
    entityId:   rule.id,
    newValue:   params.data,
  });

  return updated;
}

export async function deleteWorkflowRule(params: {
  companyId:   string;
  membershipId: string;
  userId:       string;
  ruleId:       string;
}) {
  await requirePermission(params.membershipId, "settings", "EDIT");

  const rule = await prisma.workflowRule.findFirst({
    where: { id: params.ruleId, companyId: params.companyId },
  });
  if (!rule) throw new Error("Workflow rule not found.");

  await prisma.workflowRule.delete({ where: { id: rule.id } });

  await recordAuditEvent({
    companyId:  params.companyId,
    userId:     params.userId,
    action:     "workflowRule.deleted",
    entityType: "WorkflowRule",
    entityId:   rule.id,
    previousValue: { name: rule.name },
  });
}

// ─── Rule matching ─────────────────────────────────────────────────────────────

/**
 * Returns the first active WorkflowRule that matches the given entity type
 * and amount, ordered by most-specific (narrowest amount range) first.
 * Returns null if no rule applies — meaning the entity can be
 * processed without an additional approval gate.
 */
export async function findMatchingRule(
  companyId:  string,
  entityType: string,
  amount:     number,
): Promise<any | null> {
  const rules = await prisma.workflowRule.findMany({
    where: {
      companyId,
      entityType,
      isActive: true,
      OR: [
        { minAmount: null, maxAmount: null },
        { minAmount: { lte: amount }, maxAmount: null },
        { minAmount: null, maxAmount: { gte: amount } },
        { minAmount: { lte: amount }, maxAmount: { gte: amount } },
      ],
    },
    orderBy: [{ minAmount: "asc" }],
  });

  if (rules.length === 0) return null;
  return rules[0];
}

// ─── Approval records ──────────────────────────────────────────────────────────

/** Returns the most recent Approval for an entity, regardless of status. */
export async function getApprovalForEntity(
  companyId:  string,
  entityType: string,
  entityId:   string,
): Promise<any | null> {
  return prisma.approval.findFirst({
    where:   { entityType, entityId, workflowRule: { companyId } },
    include: { workflowRule: true, decider: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPendingApproval(params: {
  ruleId:     string;
  entityType: string;
  entityId:   string;
}): Promise<any> {
  // Upsert: if a PENDING approval already exists for this entity, don't
  // create a duplicate — just return the existing one.
  const existing = await prisma.approval.findFirst({
    where: { workflowRuleId: params.ruleId, entityType: params.entityType, entityId: params.entityId, status: "PENDING" },
  });
  if (existing) return existing;

  return prisma.approval.create({
    data: {
      workflowRuleId: params.ruleId,
      entityType:     params.entityType,
      entityId:       params.entityId,
      status:         "PENDING",
    },
  });
}

/** List all PENDING approvals for the company with related entity context. */
export async function listPendingApprovals(
  companyId:   string,
  membershipId: string,
) {
  await requirePermission(membershipId, "settings", "VIEW");
  return prisma.approval.findMany({
    where: {
      status:       "PENDING",
      workflowRule: { companyId },
    },
    include: {
      workflowRule: true,
      decider:      { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ─── Decision ─────────────────────────────────────────────────────────────────

/**
 * Records an approve/reject decision on a PENDING approval.
 * Callers must check that the deciding member's role satisfies
 * workflowRule.requiredRole BEFORE calling this — this function
 * trusts the caller (i.e. the gate is in the server action).
 */
export async function decideApproval(params: {
  approvalId: string;
  companyId:  string;
  userId:     string;
  status:     "APPROVED" | "REJECTED";
  comment?:   string;
}): Promise<any> {
  const approval = await prisma.approval.findFirst({
    where: { id: params.approvalId, workflowRule: { companyId: params.companyId } },
    include: { workflowRule: true },
  });
  if (!approval) throw new Error("Approval not found.");
  if ((approval as any).status !== "PENDING") {
    throw new Error("This approval has already been decided.");
  }

  const updated = await prisma.approval.update({
    where: { id: params.approvalId },
    data: {
      status:     params.status,
      decidedBy:  params.userId,
      decidedAt:  new Date(),
      comment:    params.comment ?? null,
    },
    include: { workflowRule: true, decider: { select: { id: true, name: true, email: true } } },
  });

  await recordAuditEvent({
    companyId:  params.companyId,
    userId:     params.userId,
    action:     `approval.${params.status.toLowerCase()}`,
    entityType: "Approval",
    entityId:   params.approvalId,
    newValue: {
      status:    params.status,
      entityType: (approval as any).entityType,
      entityId:  (approval as any).entityId,
      comment:   params.comment,
    },
  });

  return updated;
}

/**
 * checkAndGate — called inside approveExpense() (and any future similar
 * functions) to enforce workflow rules before a posting action.
 *
 * Returns true  → no rule applies or caller's role satisfies it; caller
 *                 may proceed to post.
 * Returns false → a rule applies and caller's role is insufficient; a
 *                 PENDING Approval has been created; caller should throw a
 *                 user-friendly error.
 */
export async function checkAndGate(params: {
  companyId:   string;
  membershipId: string;
  entityType:  string;
  entityId:    string;
  amount:      number;
}): Promise<{ allowed: boolean; rule: any | null; callerRole: CompanyRole }> {
  // Get the caller's CompanyRole from their membership record.
  const membership = await prisma.companyMembership.findFirst({
    where: { id: params.membershipId, companyId: params.companyId },
    select: { role: true },
  });
  if (!membership) throw new Error("Membership not found.");
  const callerRole = membership.role as CompanyRole;

  const rule = await findMatchingRule(params.companyId, params.entityType, params.amount);
  if (!rule) {
    return { allowed: true, rule: null, callerRole };
  }

  if (roleAtLeast(callerRole, rule.requiredRole as CompanyRole)) {
    return { allowed: true, rule, callerRole };
  }

  // Caller doesn't have the required role — create a PENDING approval and
  // signal to the caller that posting is blocked.
  await createPendingApproval({
    ruleId:     rule.id,
    entityType: params.entityType,
    entityId:   params.entityId,
  });

  return { allowed: false, rule, callerRole };
}
