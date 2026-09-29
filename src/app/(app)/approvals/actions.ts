"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { decideApproval, getApprovalForEntity } from "@/lib/workflow";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/workflow";
import type { CompanyRole } from "@prisma/client";
import { postDraftJournalEntry } from "@/lib/ledger";

/**
 * Approve a pending approval record.
 *
 * After marking the Approval as APPROVED, this action also triggers the
 * entity-specific posting step (currently: EXPENSE → postDraftJournalEntry).
 */
export async function approveApprovalAction(approvalId: string, comment?: string) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "approvals", "APPROVE");

  // Load the approval with its workflow rule.
  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, workflowRule: { companyId: active.company.id } },
    include: { workflowRule: true },
  });
  if (!approval) throw new Error("Approval not found.");
  if ((approval as any).status !== "PENDING") {
    throw new Error("This item has already been decided.");
  }

  // Verify the approver's role satisfies the rule's requiredRole.
  const callerRole = active.role as CompanyRole;
  const requiredRole = (approval as any).workflowRule.requiredRole as CompanyRole;

  if (!roleAtLeast(callerRole, requiredRole)) {
    throw new Error(
      `This approval requires a ${requiredRole.replace(/_/g, " ")} or above. ` +
      `Your current role is ${callerRole.replace(/_/g, " ")}.`
    );
  }

  // Record the decision.
  await decideApproval({
    approvalId,
    companyId: active.company.id,
    userId:    active.userId,
    status:    "APPROVED",
    comment,
  });

  // Trigger the entity-specific post action.
  const entityType = (approval as any).entityType;
  const entityId   = (approval as any).entityId;

  if (entityType === "Expense") {
    // postDraftJournalEntry handles journals:APPROVE check internally.
    // We call it directly here (bypassing the WorkflowRule check in
    // approveExpense) because the check has ALREADY been resolved above.
    await postDraftJournalEntry({
      companyId:      active.company.id,
      membershipId:   active.id,
      userId:         active.userId,
      journalEntryId: entityId,
    });
  }

  revalidatePath("/approvals");
  revalidatePath("/expenses");
}

/** Reject a pending approval — the entity stays DRAFT. */
export async function rejectApprovalAction(approvalId: string, comment?: string) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "approvals", "APPROVE");

  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, workflowRule: { companyId: active.company.id } },
    include: { workflowRule: true },
  });
  if (!approval) throw new Error("Approval not found.");
  if ((approval as any).status !== "PENDING") {
    throw new Error("This item has already been decided.");
  }

  const callerRole = active.role as CompanyRole;
  const requiredRole = (approval as any).workflowRule.requiredRole as CompanyRole;

  if (!roleAtLeast(callerRole, requiredRole)) {
    throw new Error(
      `Rejecting this approval requires a ${requiredRole.replace(/_/g, " ")} or above.`
    );
  }

  await decideApproval({
    approvalId,
    companyId: active.company.id,
    userId:    active.userId,
    status:    "REJECTED",
    comment,
  });

  revalidatePath("/approvals");
  revalidatePath("/expenses");
}
