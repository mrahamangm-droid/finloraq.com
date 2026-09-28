import { describe, it, expect } from "vitest";
import {
  roleSatisfies, governingRule, decideExpenseApproval, validateApprovalRule, ApprovalRuleError, type ApprovalRule,
} from "./approvals";

const rule = (p: Partial<ApprovalRule>): ApprovalRule => ({ id: "r", minAmount: null, maxAmount: null, requiredRole: "FINANCE_MANAGER", isActive: true, ...p });

describe("roleSatisfies — X or more senior", () => {
  it("follows Finance Manager < CFO < Company Admin", () => {
    expect(roleSatisfies("FINANCE_MANAGER", "FINANCE_MANAGER")).toBe(true);
    expect(roleSatisfies("CFO", "FINANCE_MANAGER")).toBe(true);
    expect(roleSatisfies("COMPANY_ADMIN", "CFO")).toBe(true);
    expect(roleSatisfies("FINANCE_MANAGER", "CFO")).toBe(false);
    expect(roleSatisfies("CFO", "COMPANY_ADMIN")).toBe(false);
  });
  it("never lets an off-ladder role satisfy a ladder rule", () => {
    expect(roleSatisfies("ACCOUNTANT", "FINANCE_MANAGER")).toBe(false);
    expect(roleSatisfies("AUDITOR", "FINANCE_MANAGER")).toBe(false);
    expect(roleSatisfies("STAFF", "FINANCE_MANAGER")).toBe(false);
  });
});

describe("governingRule", () => {
  const rules = [
    rule({ id: "small", maxAmount: 500, requiredRole: "FINANCE_MANAGER" }),
    rule({ id: "mid", minAmount: 500, maxAmount: 10000, requiredRole: "CFO" }),
    rule({ id: "big", minAmount: 10000, requiredRole: "COMPANY_ADMIN" }),
    rule({ id: "off", minAmount: 0, requiredRole: "COMPANY_ADMIN", isActive: false }),
  ];
  it("uses inclusive bounds and picks the most senior overlapping rule", () => {
    expect(governingRule(rules, 100)?.id).toBe("small");
    expect(governingRule(rules, 500)?.id).toBe("mid"); // 500 is in both small and mid → CFO wins
    expect(governingRule(rules, 10000)?.id).toBe("big");
  });
  it("ignores inactive rules and returns null when nothing covers the amount", () => {
    expect(governingRule([rule({ minAmount: 1000, maxAmount: 2000 })], 50)).toBeNull();
    expect(governingRule([rule({ minAmount: 0, isActive: false })], 50)).toBeNull();
  });
});

describe("decideExpenseApproval", () => {
  const rules = [rule({ minAmount: 1000, requiredRole: "CFO" })];
  const base = { rules, approverUserId: "approver", submitterUserId: "submitter", otherEligibleApprovers: 1 };

  it("keeps today's behavior when no rule matches", () => {
    expect(decideExpenseApproval({ ...base, amount: 50, approverRole: "FINANCE_MANAGER" })).toMatchObject({ ok: true, rule: null });
  });
  it("requires the rule's role or more senior", () => {
    const low = decideExpenseApproval({ ...base, amount: 5000, approverRole: "FINANCE_MANAGER" });
    expect(low).toEqual({ ok: false, reason: "Expenses of this amount need approval by a CFO or more senior." });
    expect(decideExpenseApproval({ ...base, amount: 5000, approverRole: "CFO" }).ok).toBe(true);
    expect(decideExpenseApproval({ ...base, amount: 5000, approverRole: "COMPANY_ADMIN" }).ok).toBe(true);
  });
  it("blocks self-approval when someone else could approve", () => {
    const d = decideExpenseApproval({ ...base, amount: 50, approverRole: "COMPANY_ADMIN", approverUserId: "submitter" });
    expect(d).toEqual({ ok: false, reason: "You submitted this expense, so someone else needs to approve it." });
  });
  it("allows self-approval when no one else could (e.g. a solo founder)", () => {
    const d = decideExpenseApproval({ ...base, amount: 50, approverRole: "COMPANY_ADMIN", approverUserId: "submitter", otherEligibleApprovers: 0 });
    expect(d).toEqual({ ok: true, rule: null, selfApproval: true });
  });
  it("still enforces the role rule on a sole approver", () => {
    const d = decideExpenseApproval({ ...base, amount: 5000, approverRole: "FINANCE_MANAGER", approverUserId: "submitter", otherEligibleApprovers: 0 });
    expect(d.ok).toBe(false);
  });
});

describe("validateApprovalRule", () => {
  it("accepts ladder roles, one-sided and open ranges", () => {
    expect(validateApprovalRule({ minAmount: 500, maxAmount: null, requiredRole: "CFO" })).toEqual({ minAmount: 500, maxAmount: null, requiredRole: "CFO" });
    expect(validateApprovalRule({ minAmount: null, maxAmount: null, requiredRole: "COMPANY_ADMIN" }).requiredRole).toBe("COMPANY_ADMIN");
  });
  it("rejects off-ladder roles, negative amounts and min > max", () => {
    expect(() => validateApprovalRule({ minAmount: 1, maxAmount: 2, requiredRole: "ACCOUNTANT" })).toThrow(ApprovalRuleError);
    expect(() => validateApprovalRule({ minAmount: -1, maxAmount: null, requiredRole: "CFO" })).toThrow(ApprovalRuleError);
    expect(() => validateApprovalRule({ minAmount: 10, maxAmount: 5, requiredRole: "CFO" })).toThrow(ApprovalRuleError);
  });
});
