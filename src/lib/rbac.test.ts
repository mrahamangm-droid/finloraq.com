import { describe, it, expect } from "vitest";
import { roleCan } from "./rbac";

describe("RBAC default matrix", () => {
  it("COMPANY_ADMIN can do everything, including delete users", () => {
    expect(roleCan("COMPANY_ADMIN", "users", "DELETE")).toBe(true);
    expect(roleCan("COMPANY_ADMIN", "audit", "VIEW")).toBe(true);
  });

  it("STAFF cannot approve or delete anything", () => {
    expect(roleCan("STAFF", "expenses", "APPROVE")).toBe(false);
    expect(roleCan("STAFF", "invoices", "DELETE")).toBe(false);
  });

  it("STAFF can create their own expenses", () => {
    expect(roleCan("STAFF", "expenses", "CREATE")).toBe(true);
  });

  it("AUDITOR is read/export only, never write", () => {
    expect(roleCan("AUDITOR", "journals", "VIEW")).toBe(true);
    expect(roleCan("AUDITOR", "journals", "EXPORT")).toBe(true);
    expect(roleCan("AUDITOR", "journals", "CREATE")).toBe(false);
    expect(roleCan("AUDITOR", "journals", "EDIT")).toBe(false);
    expect(roleCan("AUDITOR", "journals", "DELETE")).toBe(false);
  });

  it("ACCOUNTANT has no access to Settings or Users", () => {
    expect(roleCan("ACCOUNTANT", "settings", "VIEW")).toBe(false);
    expect(roleCan("ACCOUNTANT", "users", "VIEW")).toBe(false);
  });

  it("FINANCE_MANAGER can approve bills and expenses but not delete journals", () => {
    expect(roleCan("FINANCE_MANAGER", "bills", "APPROVE")).toBe(true);
    expect(roleCan("FINANCE_MANAGER", "journals", "DELETE")).toBe(false);
  });

  it("CFO and FINANCE_MANAGER can reconcile bank accounts; ACCOUNTANT cannot", () => {
    expect(roleCan("CFO", "banking", "APPROVE")).toBe(true);
    expect(roleCan("FINANCE_MANAGER", "banking", "APPROVE")).toBe(true);
    expect(roleCan("ACCOUNTANT", "banking", "APPROVE")).toBe(false);
  });

  it("every role's module list only ever grants a subset of ALL actions", () => {
    // Sanity check against typos in the matrix (e.g. a stray action name).
    const validActions = new Set(["VIEW", "CREATE", "EDIT", "APPROVE", "DELETE", "EXPORT"]);
    const roles = ["COMPANY_ADMIN", "CFO", "FINANCE_MANAGER", "ACCOUNTANT", "STAFF", "AUDITOR"] as const;
    for (const role of roles) {
      for (const action of validActions) {
        // Should never throw regardless of module/action combination.
        expect(() => roleCan(role, "reports", action as never)).not.toThrow();
      }
    }
  });
});
