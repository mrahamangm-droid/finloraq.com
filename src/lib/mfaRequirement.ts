import { prisma } from "@/lib/db";
import { mfaRequirement, newGraceDeadline, roleRequiresMfa, type MfaRequirement } from "@/lib/mfaPolicy";

/** Session cookie set by "Remind me later" on /mfa-setup. Its value is the
 *  snoozing user's id, and it's only honoured for that same user, so a
 *  different person signing in on the same browser is still prompted. No
 *  max-age, so it lasts until the browser session ends — the prompt returns
 *  on next login. It only controls whether the reminder is shown, never access. */
export const MFA_SNOOZE_COOKIE = "finloraq_mfa_snooze";

/**
 * The signed-in user's MFA requirement (policy: src/lib/mfaPolicy.ts). The
 * first time a user in a required role is seen without MFA, their grace
 * deadline is recorded, so the countdown is per person and survives restarts.
 */
export async function getMfaRequirement(userId: string, now = new Date()): Promise<MfaRequirement> {
  const [user, memberships] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabled: true, mfaGraceUntil: true } }),
    prisma.companyMembership.findMany({ where: { userId, isActive: true }, select: { role: true } }),
  ]);
  const roles = memberships.map((m) => m.role);
  if (!roleRequiresMfa(roles) || user.mfaEnabled) {
    return mfaRequirement({ mfaEnabled: user.mfaEnabled, roles, graceUntil: user.mfaGraceUntil ?? now, now });
  }
  let graceUntil = user.mfaGraceUntil;
  if (!graceUntil) {
    graceUntil = newGraceDeadline(now);
    // Only set it if still unset, so two concurrent requests can't push it later.
    await prisma.user.updateMany({ where: { id: userId, mfaGraceUntil: null }, data: { mfaGraceUntil: graceUntil } });
    graceUntil = (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaGraceUntil: true } })).mfaGraceUntil ?? graceUntil;
  }
  return mfaRequirement({ mfaEnabled: false, roles, graceUntil, now });
}
