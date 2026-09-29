import type { CompanyRole } from "@/lib/prisma-enums";

/**
 * Amount-based approval routing for expenses (spec section 13), read from
 * the WorkflowRule table. Pure — no I/O — so approvals.test.ts covers the
 * whole policy; src/lib/expenseApproval.ts wires it to the database.
 *
 * The policy, as decided by the account owner:
 *  - A rule says "expenses from min to max need role X". X is satisfied by
 *    X *or a more senior* approver on the ladder below.
 *  - When several active rules match an amount, the most senior required
 *    role wins (the strictest reading, never the most lenient).
 *  - An amount no rule covers keeps today's behavior: anyone who can
 *    approve journals may approve it.
 *  - The person who submitted an expense may not approve it — unless no
 *    one else in the company could, in which case they may (and it is
 *    audited as such). Without that exception a solo founder, or a rule
 *    only the submitter satisfies, would leave an expense unapprovable.
 *  - Rules only ever add restrictions. The journals:APPROVE permission is
 *    still required on top of them; a rule never grants approval.
 */

/** Seniority ladder for approval. Roles off the ladder can't satisfy a rule. */
export const APPROVER_LADDER: readonly CompanyRole[] = ["FINANCE_MANAGER", "CFO", "COMPANY_ADMIN"];

export function approverRank(role: CompanyRole): number {
  return APPROVER_LADDER.indexOf(role); // -1 when not on the ladder
}

/** Does `role` meet a rule requiring `required`? ("X or more senior".) */
export function roleSatisfies(role: CompanyRole, required: CompanyRole): boolean {
  const need = approverRank(required);
  if (need === -1) return role === required; // a legacy off-ladder rule: exact match only
  return approverRank(role) >= need;
}

export interface ApprovalRule {
  id: string;
  minAmount: number | null;
  maxAmount: number | null;
  requiredRole: CompanyRole;
  isActive: boolean;
}

/** The single rule that governs `amount`: among active rules whose range
 *  includes it (bounds inclusive, null = open), the most senior one. */
export function governingRule(rules: ApprovalRule[], amount: number): ApprovalRule | null {
  const matching = rules.filter(
    (r) => r.isActive && (r.minAmount === null || amount >= r.minAmount) && (r.maxAmount === null || amount <= r.maxAmount),
  );
  if (matching.length === 0) return null;
  return matching.reduce((a, b) => (approverRank(b.requiredRole) > approverRank(a.requiredRole) ? b : a));
}

export type ApprovalDecision =
  | { ok: true; rule: ApprovalRule | null; selfApproval: boolean }
  | { ok: false; reason: string };

const ROLE_LABEL: Record<CompanyRole, string> = {
  COMPANY_ADMIN: "a Company Admin",
  CFO: "a CFO",
  FINANCE_MANAGER: "a Finance Manager",
  ACCOUNTANT: "an Accountant",
  STAFF: "a Staff member",
  AUDITOR: "an Auditor",
};

export function describeRequirement(required: CompanyRole): string {
  const i = approverRank(required);
  if (i === -1) return ROLE_LABEL[required];
  if (i === APPROVER_LADDER.length - 1) return ROLE_LABEL[required];
  return `${ROLE_LABEL[required]} or more senior`;
}

/**
 * Decides whether this approver may approve this expense. `otherEligibleApprovers`
 * is how many OTHER active members (not the submitter) hold journals:APPROVE
 * and satisfy the governing rule — it's only consulted for self-approval.
 */
export function decideExpenseApproval(params: {
  amount: number;
  rules: ApprovalRule[];
  approverRole: CompanyRole;
  approverUserId: string;
  submitterUserId: string;
  otherEligibleApprovers: number;
}): ApprovalDecision {
  const rule = governingRule(params.rules, params.amount);

  if (rule && !roleSatisfies(params.approverRole, rule.requiredRole)) {
    return { ok: false, reason: `Expenses of this amount need approval by ${describeRequirement(rule.requiredRole)}.` };
  }

  const selfApproval = params.approverUserId === params.submitterUserId;
  if (selfApproval && params.otherEligibleApprovers > 0) {
    return { ok: false, reason: "You submitted this expense, so someone else needs to approve it." };
  }

  return { ok: true, rule, selfApproval };
}

export class ApprovalRuleError extends Error {}

/** Validates a rule before it's saved from Settings → Approvals. */
export function validateApprovalRule(input: { minAmount: number | null; maxAmount: number | null; requiredRole: string }): {
  minAmount: number | null;
  maxAmount: number | null;
  requiredRole: CompanyRole;
} {
  const role = input.requiredRole as CompanyRole;
  if (!APPROVER_LADDER.includes(role)) {
    throw new ApprovalRuleError("Choose Finance Manager, CFO or Company Admin as the required approver.");
  }
  for (const v of [input.minAmount, input.maxAmount]) {
    if (v !== null && (!Number.isFinite(v) || v < 0)) throw new ApprovalRuleError("Amounts must be zero or more.");
  }
  // Neither bound set is allowed on purpose: "every expense needs a CFO" is a real policy.
  if (input.minAmount !== null && input.maxAmount !== null && input.minAmount > input.maxAmount) {
    throw new ApprovalRuleError("The minimum can't be more than the maximum.");
  }
  return { minAmount: input.minAmount, maxAmount: input.maxAmount, requiredRole: role };
}
