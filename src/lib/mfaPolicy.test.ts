import { describe, it, expect } from "vitest";
import { mfaRequirement, newGraceDeadline, roleRequiresMfa, MFA_GRACE_DAYS } from "./mfaPolicy";

const now = new Date("2026-10-01T12:00:00Z");

describe("MFA policy for privileged roles", () => {
  it("applies to Company Admins and CFOs only", () => {
    expect(roleRequiresMfa(["COMPANY_ADMIN"])).toBe(true);
    expect(roleRequiresMfa(["CFO"])).toBe(true);
    expect(roleRequiresMfa(["FINANCE_MANAGER", "ACCOUNTANT", "STAFF", "AUDITOR"])).toBe(false);
    expect(roleRequiresMfa(["STAFF", "CFO"])).toBe(true); // any company where they hold the role
  });

  it("gives a 14-day grace period", () => {
    expect(MFA_GRACE_DAYS).toBe(14);
    expect(newGraceDeadline(now).toISOString()).toBe("2026-10-15T12:00:00.000Z");
  });

  it("is satisfied once MFA is on, and not required for other roles", () => {
    const graceUntil = newGraceDeadline(now);
    expect(mfaRequirement({ mfaEnabled: true, roles: ["COMPANY_ADMIN"], graceUntil, now })).toEqual({ kind: "satisfied" });
    expect(mfaRequirement({ mfaEnabled: false, roles: ["STAFF"], graceUntil, now })).toEqual({ kind: "not_required" });
  });

  it("counts down days left, then becomes overdue — never a lockout state", () => {
    const graceUntil = newGraceDeadline(now);
    expect(mfaRequirement({ mfaEnabled: false, roles: ["CFO"], graceUntil, now })).toMatchObject({ kind: "grace", daysLeft: 14 });
    const lastDay = new Date(graceUntil.getTime() - 60 * 60 * 1000);
    expect(mfaRequirement({ mfaEnabled: false, roles: ["CFO"], graceUntil, now: lastDay })).toMatchObject({ kind: "grace", daysLeft: 1 });
    expect(mfaRequirement({ mfaEnabled: false, roles: ["CFO"], graceUntil, now: graceUntil })).toMatchObject({ kind: "overdue" });
  });
});
