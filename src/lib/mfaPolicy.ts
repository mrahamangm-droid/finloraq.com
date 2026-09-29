import type { CompanyRole } from "@prisma/client";

/**
 * MFA requirement for privileged roles, as decided by the account owner:
 * Company Admins and CFOs must set up two-step verification, but nobody is
 * ever locked out. Someone in those roles without MFA is prompted to enroll
 * when they sign in, with a grace period; after it ends they're still let
 * in, just with a persistent reminder. Pure — covered by mfaPolicy.test.ts.
 */
export const MFA_REQUIRED_ROLES: readonly CompanyRole[] = ["COMPANY_ADMIN", "CFO"];
export const MFA_GRACE_DAYS = 14;

export type MfaRequirement =
  | { kind: "not_required" }
  | { kind: "satisfied" }
  | { kind: "grace"; daysLeft: number; graceUntil: Date }
  | { kind: "overdue"; graceUntil: Date };

export function roleRequiresMfa(roles: CompanyRole[]): boolean {
  return roles.some((r) => MFA_REQUIRED_ROLES.includes(r));
}

/** A new grace deadline, counted from `now`. */
export function newGraceDeadline(now: Date): Date {
  return new Date(now.getTime() + MFA_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

export function mfaRequirement(params: { mfaEnabled: boolean; roles: CompanyRole[]; graceUntil: Date; now: Date }): MfaRequirement {
  if (!roleRequiresMfa(params.roles)) return { kind: "not_required" };
  if (params.mfaEnabled) return { kind: "satisfied" };
  const msLeft = params.graceUntil.getTime() - params.now.getTime();
  if (msLeft > 0) return { kind: "grace", daysLeft: Math.ceil(msLeft / (24 * 60 * 60 * 1000)), graceUntil: params.graceUntil };
  return { kind: "overdue", graceUntil: params.graceUntil };
}
